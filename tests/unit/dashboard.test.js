'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const{DateTime}=require('luxon');const{rangesFor,resolveRange}=require('../../src/modules/dashboard/ranges');const{colorForCode,progress}=require('../../src/modules/dashboard/dashboard.service');
const now=DateTime.fromISO('2026-07-22T23:30:00',{zone:'America/Sao_Paulo'});
const{newFirstPlaceSeller}=require('../../src/modules/sales/sales.service');
test('ranges inclusivos usam semana segunda-domingo e quinzena correta',()=>{const r=rangesFor(now);assert.deepEqual(r.week,{start:'2026-07-20',end:'2026-07-26',periodCode:'weekly'});assert.deepEqual(r.biweekly,{start:'2026-07-16',end:'2026-07-31',periodCode:'biweekly'});});
test('hoje comercial não vira dia por UTC',()=>assert.equal(resolveRange({period:'today'},'America/Sao_Paulo',now).start,'2026-07-22'));
test('custom exige as duas datas e ordem válida',()=>{assert.throws(()=>resolveRange({period:'custom',start_date:'2026-07-02'},'America/Sao_Paulo',now));assert.equal(resolveRange({period:'custom',start_date:'2026-07-01',end_date:'2026-07-02'},'America/Sao_Paulo',now).end,'2026-07-02');});
test('status de progresso segue limiares',()=>{assert.equal(progress(0,null).status,'neutral');assert.equal(progress(89,100).status,'danger');assert.equal(progress(90,100).status,'warning');assert.equal(progress(100,100).status,'success');});
test('cor de operadora é determinística inclusive para código novo',()=>assert.equal(colorForCode('nova'),colorForCode('nova')));

test('ultrapassagem só ocorre ao assumir a primeira colocação, inclusive com duas vendedoras',()=>{assert.equal(newFirstPlaceSeller([{seller_id:1},{seller_id:2}],[{seller_id:2},{seller_id:1}]),2);assert.equal(newFirstPlaceSeller([{seller_id:1},{seller_id:2},{seller_id:3}],[{seller_id:1},{seller_id:3},{seller_id:2}]),null);});
