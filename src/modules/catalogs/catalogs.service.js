'use strict';

const { AppError } = require('../../shared/errors');
const media = require('../media/media.service');

const definitions = {
  services: { table: 'services', label: 'Serviços', singular: 'Serviço', path: 'services', mediaColumn: 'icon_media_id', mediaKind: 'service_icon' },
  operators: { table: 'operators', label: 'Operadoras', singular: 'Operadora', path: 'operators', mediaColumn: 'icon_media_id', mediaKind: 'operator_icon' },
  'sale-types': { table: 'sale_types', label: 'Tipos de venda', singular: 'Tipo de venda', path: 'sale-types', mediaColumn: 'icon_media_id', mediaKind: 'sale_type_icon' },
  sellers: { table: 'sellers', label: 'Vendedoras', singular: 'Vendedora', path: 'sellers', nameColumn: 'full_name', mediaColumn: 'photo_media_id', mediaKind: 'seller_photo' }
};

function definition(key) { const found = definitions[key]; if (!found) throw new Error(`Catálogo inválido: ${key}`); return { nameColumn: 'name', ...found }; }

async function list(db, key, query = {}) {
  const def = definition(key);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size) || 25));
  const base = db(def.table).where((builder) => { if (query.search) builder.where(def.nameColumn, 'like', `%${String(query.search).slice(0, 120)}%`); if (query.status === 'active') builder.where('is_active', true); if (query.status === 'inactive') builder.where('is_active', false); });
  const countRow = await base.clone().count({ count: '*' }).first();
  const items = await base.clone().select('*').orderBy(def.nameColumn).limit(pageSize).offset((page - 1) * pageSize);
  return { items, pagination: { page, pageSize, total: Number(countRow.count), pages: Math.max(1, Math.ceil(Number(countRow.count) / pageSize)) } };
}

async function create(db, key, input, file, userId) {
  const def = definition(key);
  const mediaId = await media.saveImage(db, file, def.mediaKind, userId);
  const data = { [def.nameColumn]: input[def.nameColumn], is_active: input.is_active };
  if (input.code) data.code = input.code;
  if (mediaId) data[def.mediaColumn] = mediaId;
  try { const [id] = await db(def.table).insert(data); return { id }; }
  catch (error) { if (mediaId) await media.removeIfOrphan(db, mediaId); if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'CATALOG_CONFLICT', 'Já existe um registro com esse código ou nome.'); throw error; }
}

async function update(db, key, id, input, file, userId) {
  const def = definition(key);
  const before = await db(def.table).where({ id }).first();
  if (!before) throw new AppError(404, 'CATALOG_NOT_FOUND', 'Registro não encontrado.');
  const newMediaId = await media.saveImage(db, file, def.mediaKind, userId);
  const data = { [def.nameColumn]: input[def.nameColumn], is_active: input.is_active, updated_at: db.fn.now() };
  if (newMediaId) data[def.mediaColumn] = newMediaId;
  else if (input.remove_icon || input.remove_photo) data[def.mediaColumn] = null;
  try { await db(def.table).where({ id }).update(data); }
  catch (error) { if (newMediaId) await media.removeIfOrphan(db, newMediaId); if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'CATALOG_CONFLICT', 'Já existe um registro com esse nome.'); throw error; }
  if ((newMediaId || data[def.mediaColumn] === null) && before[def.mediaColumn]) await media.removeIfOrphan(db, before[def.mediaColumn]);
  return before;
}

async function remove(db, key, id) {
  const def = definition(key);
  const row = await db(def.table).where({ id }).first();
  if (!row) throw new AppError(404, 'CATALOG_NOT_FOUND', 'Registro não encontrado.');
  const references = key === 'sellers'
    ? await Promise.all([db('sales').where({ seller_id: id }).first(), db('goals').where({ seller_id: id }).first()])
    : await db('sales').where({ [{ services: 'service_id', operators: 'operator_id', 'sale-types': 'sale_type_id' }[key]]: id }).first();
  const referenced = Array.isArray(references) ? references.some(Boolean) : Boolean(references);
  if (referenced) { await db(def.table).where({ id }).update({ is_active: false, updated_at: db.fn.now() }); return { deleted: false, deactivated: true }; }
  await db(def.table).where({ id }).delete();
  await media.removeIfOrphan(db, row[def.mediaColumn]);
  return { deleted: true, deactivated: false };
}

module.exports = { definitions, definition, list, create, update, remove };
