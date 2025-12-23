const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://migrator:Dabestis123_@168.231.125.70:5432/jvkpro';

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper to convert MySQL-style queries to PostgreSQL
// Replaces ? with $1, $2, etc.
function convertQuery(sql, params) {
  if (!params || params.length === 0) return { sql, params };

  let paramIndex = 0;
  const convertedSql = sql.replace(/\?/g, () => `$${++paramIndex}`);

  return { sql: convertedSql, params };
}

// Query wrapper with retry logic
const queryWithRetry = async (sql, params = [], maxRetries = 3) => {
  const { sql: convertedSql, params: convertedParams } = convertQuery(sql, params);

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await pool.query(convertedSql, convertedParams);
      // Return in MySQL-compatible format [rows, fields]
      return [result.rows, result.fields];
    } catch (err) {
      lastError = err;
      const isRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH']
        .some(code => err.code === code || err.message?.includes(code));

      if (isRetryable && attempt < maxRetries) {
        console.log(`DB query retry ${attempt}/${maxRetries} after ${err.code || err.message}`);
        await new Promise(r => setTimeout(r, 500 * attempt));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
};

const poolProxy = {
  query: (sql, params) => queryWithRetry(sql, params),
  getConnection: async () => {
    const client = await pool.connect();
    return {
      query: async (sql, params) => {
        const { sql: convertedSql, params: convertedParams } = convertQuery(sql, params);
        const result = await client.query(convertedSql, convertedParams);
        return [result.rows, result.fields];
      },
      release: () => client.release(),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK')
    };
  },
  end: () => pool.end()
};

// Keep-alive ping
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    // Silently ignore ping errors
  }
}, 30000);

const testConnection = async () => {
  try {
    const client = await pool.connect();
    const dbName = DATABASE_URL.split('/').pop().split('?')[0];
    console.log('✅ PostgreSQL connected:', dbName);
    client.release();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error.message);
    return false;
  }
};

module.exports = { pool: poolProxy, testConnection };
