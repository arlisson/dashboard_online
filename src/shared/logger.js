'use strict';

const pino = require('pino');
const { loadEnv } = require('../config/env');

const logger = pino({
  level: loadEnv().LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash', '*.SESSION_SECRET', '*.DB_PASSWORD']
});

module.exports = { logger };
