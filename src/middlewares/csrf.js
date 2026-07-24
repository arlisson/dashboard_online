'use strict';

const crypto = require('node:crypto');
const { AppError } = require('../shared/errors');

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data') && !req.body?._csrf && !req.get('x-csrf-token')) return next();
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const expected = req.session?.csrfToken;
  if (!supplied || !expected) return next(new AppError(403, 'CSRF_INVALID', 'A sessão do formulário expirou. Atualize a página.'));
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return next(new AppError(403, 'CSRF_INVALID', 'A sessão do formulário expirou. Atualize a página.'));
  next();
}

module.exports = { csrfToken, csrfProtection };
