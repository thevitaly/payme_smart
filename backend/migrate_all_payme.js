const mysql = require('mysql2/promise');
const { Client } = require('pg');

const MYSQL_CONFIG = {
  host: '45.93.137.27',
  port: 43036,
  user: 'sandconn',
  password: 'v1oArF#-i71x.2025',
  database: 'jvkpro_sandbox'
};

const PG_URL = 'postgresql://migrator:Dabestis123_@168.231.125.70:5432/jvkpro';

async function migrateAllPayme() {
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const pgClient = new Client({ connectionString: PG_URL });
  await pgClient.connect();

  console.log('Connected to both databases\n');

  try {
    // 1. Create payme_users table
    console.log('=== Creating payme_users ===');
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS payme_users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL UNIQUE,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_payme_users_telegram ON payme_users(telegram_id)`);
    console.log('Table created');

    // Migrate users
    const [mysqlUsers] = await mysqlConn.query('SELECT * FROM payme_users');
    console.log(`Found ${mysqlUsers.length} users in MySQL`);

    await pgClient.query('DELETE FROM payme_users');

    for (const user of mysqlUsers) {
      await pgClient.query(
        `INSERT INTO payme_users (id, telegram_id, username, first_name, last_name, is_active, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [user.id, user.telegram_id, user.username, user.first_name, user.last_name,
         user.is_active === 1, user.is_admin === 1, user.created_at, user.updated_at]
      );
    }
    console.log(`Migrated ${mysqlUsers.length} users`);

    // 2. Create payme_invites table
    console.log('\n=== Creating payme_invites ===');
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS payme_invites (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        created_by BIGINT NOT NULL,
        used_by BIGINT,
        is_used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP
      )
    `);
    await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_payme_invites_code ON payme_invites(code)`);
    console.log('Table created');

    // Migrate invites
    const [mysqlInvites] = await mysqlConn.query('SELECT * FROM payme_invites');
    console.log(`Found ${mysqlInvites.length} invites in MySQL`);

    await pgClient.query('DELETE FROM payme_invites');

    for (const inv of mysqlInvites) {
      await pgClient.query(
        `INSERT INTO payme_invites (id, code, created_by, used_by, is_used, created_at, used_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [inv.id, inv.code, inv.created_by, inv.used_by, inv.is_used === 1, inv.created_at, inv.used_at]
      );
    }
    console.log(`Migrated ${mysqlInvites.length} invites`);

    // 3. Create payme_pending_actions table
    console.log('\n=== Creating payme_pending_actions ===');
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS payme_pending_actions (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        expense_id INTEGER REFERENCES payme_expenses(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);
    await pgClient.query(`CREATE INDEX IF NOT EXISTS idx_payme_pending_telegram ON payme_pending_actions(telegram_id)`);
    console.log('Table created');

    // Migrate pending_actions
    const [mysqlPending] = await mysqlConn.query('SELECT * FROM payme_pending_actions');
    console.log(`Found ${mysqlPending.length} pending actions in MySQL`);

    await pgClient.query('DELETE FROM payme_pending_actions');

    for (const pa of mysqlPending) {
      await pgClient.query(
        `INSERT INTO payme_pending_actions (id, telegram_id, expense_id, action_type, data, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pa.id, pa.telegram_id, pa.expense_id, pa.action_type, pa.data, pa.created_at, pa.expires_at]
      );
    }
    console.log(`Migrated ${mysqlPending.length} pending actions`);

    // Update sequences
    const maxUserId = Math.max(...mysqlUsers.map(u => u.id), 0);
    const maxInvId = Math.max(...mysqlInvites.map(i => i.id), 0);
    const maxPendId = Math.max(...mysqlPending.map(p => p.id), 0);

    if (maxUserId > 0) await pgClient.query(`ALTER SEQUENCE payme_users_id_seq RESTART WITH ${maxUserId + 1}`);
    if (maxInvId > 0) await pgClient.query(`ALTER SEQUENCE payme_invites_id_seq RESTART WITH ${maxInvId + 1}`);
    if (maxPendId > 0) await pgClient.query(`ALTER SEQUENCE payme_pending_actions_id_seq RESTART WITH ${maxPendId + 1}`);

    console.log('\n========================================');
    console.log('ALL PAYME TABLES MIGRATED!');
    console.log('========================================');
    console.log(`Users: ${mysqlUsers.length}`);
    console.log(`Invites: ${mysqlInvites.length}`);
    console.log(`Pending Actions: ${mysqlPending.length}`);

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await mysqlConn.end();
    await pgClient.end();
  }
}

migrateAllPayme().catch(console.error);
