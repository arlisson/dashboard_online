'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../../shared/errors');

function detectImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new AppError(422, 'INVALID_IMAGE', 'Envie uma imagem PNG, JPEG ou WebP válida.');
}

async function saveImage(db, file, kind, userId) {
  if (!file?.buffer?.length) return null;
  const mimeType = detectImage(file.buffer);
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const duplicate = await db('media_files').where({ sha256, kind }).first();
  if (duplicate) return duplicate.id;
  const [id] = await db('media_files').insert({ kind, original_name: String(file.originalname || 'imagem').slice(0, 255), mime_type: mimeType, byte_size: file.buffer.length, sha256, content: file.buffer, created_by: userId });
  return id;
}

async function removeIfOrphan(db, mediaId) {
  if (!mediaId) return false;
  const references = await Promise.all([
    db('sellers').where({ photo_media_id: mediaId }).first(), db('services').where({ icon_media_id: mediaId }).first(),
    db('operators').where({ icon_media_id: mediaId }).first(), db('sale_types').where({ icon_media_id: mediaId }).first()
  ]);
  if (references.some(Boolean)) return false;
  await db('media_files').where({ id: mediaId }).delete();
  return true;
}

module.exports = { detectImage, saveImage, removeIfOrphan };
