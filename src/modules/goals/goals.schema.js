'use strict';

const { z } = require('zod');
const { decimal, Decimal } = require('../../shared/money');

const nullableMoney = z.preprocess((v) => v === '' || v == null ? null : v, z.union([z.string(),z.number(),z.null()])).refine((v) => v === null || decimal(v) !== null, 'Valor monetário inválido.').transform((v) => v === null ? null : decimal(v).toFixed(2));
const nullableId = z.preprocess((v) => v === '' || v == null ? null : v, z.union([z.coerce.number().int().positive(),z.null()]));
const moneyColumns = ['morning_value','afternoon_value','portability_base_value','portability_out_value','new_base_value','new_out_value'];

const goalSchema = z.object({
  goal_period_id: z.coerce.number().int().positive(), goal_type: z.enum(['general','individual']), seller_id: nullableId,
  goal_value: nullableMoney.refine((v) => v !== null, 'Meta total obrigatória.'),
  morning_value: nullableMoney, afternoon_value: nullableMoney, portability_base_value: nullableMoney, portability_out_value: nullableMoney, new_base_value: nullableMoney, new_out_value: nullableMoney,
  start_date: z.iso.date(), end_date: z.iso.date()
}).superRefine((value, ctx) => {
  if (value.start_date > value.end_date) ctx.addIssue({code:'custom',path:['end_date'],message:'A data final deve ser igual ou posterior à inicial.'});
  if (value.goal_type === 'individual' && !value.seller_id) ctx.addIssue({code:'custom',path:['seller_id'],message:'Selecione a vendedora da meta individual.'});
  if (value.goal_type === 'general' && value.seller_id) ctx.addIssue({code:'custom',path:['seller_id'],message:'Meta geral não possui vendedora.'});
  const categories = ['portability_base_value','portability_out_value','new_base_value','new_out_value'];
  const usedCategories = categories.filter((key) => value[key] !== null);
  if (usedCategories.length && usedCategories.length !== 4) ctx.addIssue({code:'custom',path:['portability_base_value'],message:'Preencha as quatro categorias ou deixe todas vazias.'});
  if (usedCategories.length === 4 && !categories.reduce((sum,key) => sum.plus(value[key]),new Decimal(0)).eq(value.goal_value)) ctx.addIssue({code:'custom',path:['goal_value'],message:'A soma das quatro categorias deve ser igual à meta total.'});
  const shifts = ['morning_value','afternoon_value'];
  const usedShifts = shifts.filter((key) => value[key] !== null);
  if (usedShifts.length && usedShifts.length !== 2) ctx.addIssue({code:'custom',path:['morning_value'],message:'Preencha manhã e tarde ou deixe ambas vazias.'});
  if (usedShifts.length === 2 && !new Decimal(value.morning_value).plus(value.afternoon_value).eq(value.goal_value)) ctx.addIssue({code:'custom',path:['goal_value'],message:'Manhã + tarde deve ser igual à meta total.'});
});

module.exports = { goalSchema, moneyColumns };
