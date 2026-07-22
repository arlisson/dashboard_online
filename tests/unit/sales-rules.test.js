'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getSaleShift } = require('../../src/shared/commercial-time');
const { isValidCnpj } = require('../../src/shared/cnpj');
const { calculateTotal } = require('../../src/shared/money');
const { sortRanking, didOvertake } = require('../../src/modules/sales/ranking');

for (const [time, expected] of [['07:59','error'],['08:00','morning'],['11:59','morning'],['12:00','error'],['13:29','error'],['13:30','afternoon'],['17:30','afternoon'],['17:31','error']]) {
  test(`limite de expediente ${time}`, () => expected === 'error' ? assert.throws(() => getSaleShift(time)) : assert.equal(getSaleShift(time), expected));
}
test('valida DV de CNPJ', () => { assert.equal(isValidCnpj('07.404.596/0001-34'), true); assert.equal(isValidCnpj('07.404.596/0001-35'), false); });
test('total usa decimal com duas casas', () => assert.equal(calculateTotal(3, '10.005'), '30.02'));
test('ranking desempata por receita, unidades, primeira venda e ID', () => {
  const rows = [{seller_id:3,revenue:'100',units:2,first_sale:'2026-01-01 09:00'}, {seller_id:2,revenue:'100',units:2,first_sale:'2026-01-01 08:00'}, {seller_id:1,revenue:'100',units:3,first_sale:'2026-01-01 10:00'}];
  assert.deepEqual(sortRanking(rows).map((row) => row.seller_id), [1,2,3]);
  assert.equal(didOvertake(rows, [rows[1], rows[0], rows[2]], 2), true);
});
