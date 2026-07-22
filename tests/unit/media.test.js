'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectImage } = require('../../src/modules/media/media.service');

test('detecta PNG por magic bytes sem confiar no nome', () => {
  const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  assert.equal(detectImage(png), 'image/png');
});

test('rejeita conteúdo disfarçado de imagem', () => {
  assert.throws(() => detectImage(Buffer.from('<script>alert(1)</script>')), /PNG, JPEG ou WebP/);
});
