'use strict';

const { AppError } = require('../../shared/errors');
const { getSaleShift } = require('../../shared/commercial-time');
const { calculateTotal } = require('../../shared/money');
const { sortRanking } = require('./ranking');

const fkDefinitions = [['seller_id','sellers'],['service_id','services'],['operator_id','operators'],['sale_type_id','sale_types']];

function applyFilters(query, filters = {}) {
  query.whereNull('sales.deleted_at');
  for (const field of ['seller_id','service_id','operator_id','sale_type_id']) if (filters[field]) query.where(`sales.${field}`, Number(filters[field]));
  if (filters.shift) query.where('sales.sale_shift', filters.shift);
  if (filters.has_doc === 'true' || filters.has_doc === 'false') query.where('sales.has_doc', filters.has_doc === 'true');
  if (filters.is_base_sale === 'true' || filters.is_base_sale === 'false') query.where('sales.is_base_sale', filters.is_base_sale === 'true');
  if (filters.start_date) query.where('sales.sale_date', '>=', filters.start_date);
  if (filters.end_date) query.where('sales.sale_date', '<=', filters.end_date);
  if (filters.search) {
    const term = `%${String(filters.search).slice(0, 191)}%`;
    query.where((builder) => builder.where('sellers.full_name', 'like', term).orWhere('services.name', 'like', term).orWhere('operators.name', 'like', term).orWhere('sale_types.name', 'like', term).orWhere('sales.cnpj_digits', 'like', term).orWhere('sales.company_name', 'like', term).orWhere('sales.phone', 'like', term).orWhere('sales.closed_by_name', 'like', term).orWhere('sales.notes', 'like', term));
  }
  return query;
}

function joinedQuery(db) {
  return db('sales').join('sellers','sellers.id','sales.seller_id').join('services','services.id','sales.service_id').join('operators','operators.id','sales.operator_id').join('sale_types','sale_types.id','sales.sale_type_id');
}

async function listSales(db, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1), pageSize = Math.min(100, Math.max(1, Number(filters.page_size) || 25));
  const base = applyFilters(joinedQuery(db), filters);
  const count = await base.clone().clearSelect().clearOrder().countDistinct({ count: 'sales.id' }).first();
  const items = await base.clone().select('sales.*','sellers.full_name as seller_name','services.name as service_name','operators.name as operator_name','sale_types.name as sale_type_name','sale_types.code as sale_type_code').orderBy([{column:'sales.sale_date',order:'desc'},{column:'sales.sale_time',order:'desc'},{column:'sales.id',order:'desc'}]).limit(pageSize).offset((page-1)*pageSize);
  const total = Number(count.count);
  return { items, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total/pageSize)) } };
}

async function getSale(db, id) {
  const row = await db('sales').where({ id }).whereNull('deleted_at').first();
  if (!row) throw new AppError(404, 'SALE_NOT_FOUND', 'Venda não encontrada.');
  return row;
}

async function validateReferences(trx, input, current) {
  for (const [column, table] of fkDefinitions) {
    const row = await trx(table).where({ id: input[column] }).forUpdate().first();
    if (!row) throw new AppError(422, 'INVALID_REFERENCE', 'Há uma referência inexistente.', { [column]: 'Registro não encontrado.' });
    if (!row.is_active && (!current || Number(current[column]) !== Number(input[column]))) throw new AppError(422, 'INACTIVE_REFERENCE', 'Use somente cadastros ativos em novas relações.', { [column]: 'Registro inativo.' });
  }
}

function saleData(input, userId, current = null) {
  return {
    seller_id: input.seller_id, service_id: input.service_id, operator_id: input.operator_id, sale_type_id: input.sale_type_id,
    sale_date: input.sale_date, sale_time: input.sale_time.length === 5 ? `${input.sale_time}:00` : input.sale_time,
    sale_shift: getSaleShift(input.sale_time), cnpj_digits: input.cnpj, company_name: input.company_name, phone: input.phone,
    closed_by_name: input.closed_by_name, quantity: input.quantity, unit_value: input.unit_value,
    total_value: calculateTotal(input.quantity, input.unit_value), has_doc: input.has_doc, is_base_sale: input.is_base_sale, notes: input.notes,
    ...(current ? { updated_by: userId } : { created_by: userId, updated_by: userId })
  };
}

async function rankingSnapshot(db, date) {
  const rows = await db('sales').select('seller_id').sum({ revenue: 'total_value', units: 'quantity' }).min({ first_sale: db.raw("CONCAT(sale_date, ' ', sale_time)") }).where({ sale_date: date }).whereNull('deleted_at').groupBy('seller_id');
  return sortRanking(rows);
}

function improvedSeller(before, after) {
  for (let index = 0; index < after.length; index += 1) {
    const oldIndex = before.findIndex((row) => Number(row.seller_id) === Number(after[index].seller_id));
    if (oldIndex >= 0 && index < oldIndex) return Number(after[index].seller_id);
  }
  return null;
}

async function applicableDailyGoal(db, date, sellerId) {
  const period = await db('goal_periods').where({ code: 'daily' }).first();
  if (!period) return null;
  const base = db('goals').where({ goal_period_id: period.id }).whereNull('deleted_at').where('start_date','<=',date).where('end_date','>=',date);
  const individual = await base.clone().where({ goal_type: 'individual', seller_id: sellerId }).first();
  if (individual) return individual;
  return base.clone().where({ goal_type: 'general' }).whereNull('seller_id').first();
}

async function realizedForGoal(db, goal, date, sellerId) {
  const query = db('sales').sum({ value: 'total_value' }).where({ sale_date: date }).whereNull('deleted_at');
  if (goal.goal_type === 'individual') query.where({ seller_id: sellerId });
  const row = await query.first();
  return Number(row.value || 0);
}

async function emit(db, type, payload) {
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db('dashboard_events').insert({ type, payload: JSON.stringify(payload), expires_at: expiresAt });
}

async function mutateSale(db, { operation, id, input, userId }) {
  return db.transaction(async (trx) => {
    const current = id ? await getSale(trx, id) : null;
    if (operation !== 'delete') await validateReferences(trx, input, current);
    const dates = [...new Set([current?.sale_date, input?.sale_date].filter(Boolean))];
    const beforeRankings = new Map();
    for (const date of dates) beforeRankings.set(date, await rankingSnapshot(trx, date));
    const targetDate = input?.sale_date || current.sale_date;
    const sellerId = input?.seller_id || current.seller_id;
    const goal = operation === 'delete' ? null : await applicableDailyGoal(trx, targetDate, sellerId);
    const realizedBefore = goal ? await realizedForGoal(trx, goal, targetDate, sellerId) : 0;
    let saleId = id;
    if (operation === 'create') { [saleId] = await trx('sales').insert(saleData(input, userId)); }
    else if (operation === 'update') await trx('sales').where({ id }).update({ ...saleData(input, userId, current), updated_at: trx.fn.now() });
    else await trx('sales').where({ id }).update({ deleted_at: trx.fn.now(), deleted_by: userId, updated_at: trx.fn.now(), updated_by: userId });
    const eventResult = { saleCreated: operation === 'create', rankingOvertake: false, dailyGoalReached: false };
    if (operation === 'create') await emit(trx, 'sale_created', { saleId, date: targetDate });
    for (const date of dates) {
      const after = await rankingSnapshot(trx, date);
      const overtaker = improvedSeller(beforeRankings.get(date), after);
      if (overtaker) { eventResult.rankingOvertake = true; await emit(trx, 'ranking_overtake', { saleId, date, sellerId: overtaker }); }
    }
    if (goal) {
      const realizedAfter = await realizedForGoal(trx, goal, targetDate, sellerId);
      const target = Number(goal.goal_value);
      if (target > 0 && realizedBefore < target && realizedAfter >= target) { eventResult.dailyGoalReached = true; await emit(trx, 'daily_goal_reached', { saleId, date: targetDate, sellerId, goalId: goal.id }); }
    }
    return { id: Number(saleId), events: eventResult, before: current };
  });
}

async function listReferences(db, current) {
  const result = {};
  for (const [column, table] of fkDefinitions) result[table] = await db(table).where((builder) => builder.where('is_active', true).modify((inner) => { if (current?.[column]) inner.orWhere('id', current[column]); })).orderBy(table === 'sellers' ? 'full_name' : 'name');
  return result;
}

module.exports = { applyFilters, listSales, getSale, saleData, rankingSnapshot, applicableDailyGoal, mutateSale, listReferences };
