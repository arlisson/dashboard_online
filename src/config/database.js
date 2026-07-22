'use strict';

function makeKnexConfig(env) {
  return {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: ['DATE', 'TIME']
    },
    pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX },
    migrations: { directory: './src/database/migrations', tableName: 'knex_migrations' },
    seeds: { directory: './src/database/seeds' }
  };
}

module.exports = { makeKnexConfig };
