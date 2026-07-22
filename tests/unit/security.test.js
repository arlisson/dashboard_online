'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfProtection } = require('../../src/middlewares/csrf');
const { requireRole } = require('../../src/middlewares/auth');

test('CSRF rejeita mutação sem token', () => {
  let received;
  csrfProtection({ method: 'POST', body: {}, session: { csrfToken: 'known' }, get: () => undefined }, {}, (error) => { received = error; });
  assert.equal(received.code, 'CSRF_INVALID');
  assert.equal(received.status, 403);
});

test('CSRF aceita token equivalente em header', () => {
  let received = 'not-called';
  csrfProtection({ method: 'POST', body: {}, session: { csrfToken: 'known' }, get: () => 'known' }, {}, (error) => { received = error; });
  assert.equal(received, undefined);
});

test('matriz de papel impede viewer em rota admin', () => {
  let received;
  requireRole('admin')({ user: { role: 'viewer' } }, {}, (error) => { received = error; });
  assert.equal(received.code, 'FORBIDDEN');
});
