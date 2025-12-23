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

async function migrateData() {
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const pgClient = new Client({ connectionString: PG_URL });
  await pgClient.connect();

  console.log('Connected to both databases\n');

  try {
    // 1. Migrate categories
    console.log('=== Migrating Categories ===');
    const [mysqlCategories] = await mysqlConn.query('SELECT * FROM payme_categories');
    console.log(`Found ${mysqlCategories.length} categories in MySQL`);

    // Clear existing categories in PostgreSQL
    await pgClient.query('DELETE FROM payme_expenses');
    await pgClient.query('DELETE FROM payme_subcategories');
    await pgClient.query('DELETE FROM payme_categories');
    await pgClient.query('ALTER SEQUENCE payme_categories_id_seq RESTART WITH 1');
    await pgClient.query('ALTER SEQUENCE payme_subcategories_id_seq RESTART WITH 1');
    await pgClient.query('ALTER SEQUENCE payme_expenses_id_seq RESTART WITH 1');

    for (const cat of mysqlCategories) {
      await pgClient.query(
        `INSERT INTO payme_categories (id, name, code, description, is_active, order_num, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cat.id, cat.name, cat.code, cat.description, cat.is_active === 1, cat.order_num || 0, cat.created_at]
      );
    }
    console.log(`Migrated ${mysqlCategories.length} categories`);

    // 2. Migrate subcategories
    console.log('\n=== Migrating Subcategories ===');
    const [mysqlSubcategories] = await mysqlConn.query('SELECT * FROM payme_subcategories');
    console.log(`Found ${mysqlSubcategories.length} subcategories in MySQL`);

    for (const sub of mysqlSubcategories) {
      await pgClient.query(
        `INSERT INTO payme_subcategories (id, category_id, name, code, is_active, order_num, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sub.id, sub.category_id, sub.name, sub.code, sub.is_active === 1, sub.order_num || 0, sub.created_at]
      );
    }
    console.log(`Migrated ${mysqlSubcategories.length} subcategories`);

    // 3. Migrate expenses
    console.log('\n=== Migrating Expenses ===');
    const [mysqlExpenses] = await mysqlConn.query('SELECT * FROM payme_expenses');
    console.log(`Found ${mysqlExpenses.length} expenses in MySQL`);

    for (const exp of mysqlExpenses) {
      await pgClient.query(
        `INSERT INTO payme_expenses
         (id, description, amount, currency, category_id, subcategory_id, status,
          payment_type, input_type, original_text, transcription, file_path,
          dropbox_url, created_at, confirmed_at, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          exp.id,
          exp.description,
          exp.amount,
          exp.currency || 'EUR',
          exp.category_id,
          exp.subcategory_id,
          exp.status,
          exp.payment_type || 'CASH',
          exp.input_type || 'TEXT',
          exp.original_text,
          exp.transcription,
          exp.file_path,
          exp.dropbox_url,
          exp.created_at,
          exp.confirmed_at,
          'telegram'
        ]
      );
    }
    console.log(`Migrated ${mysqlExpenses.length} expenses`);

    // Update sequences to continue from max id
    const maxCatId = Math.max(...mysqlCategories.map(c => c.id), 0);
    const maxSubId = Math.max(...mysqlSubcategories.map(s => s.id), 0);
    const maxExpId = Math.max(...mysqlExpenses.map(e => e.id), 0);

    await pgClient.query(`ALTER SEQUENCE payme_categories_id_seq RESTART WITH ${maxCatId + 1}`);
    await pgClient.query(`ALTER SEQUENCE payme_subcategories_id_seq RESTART WITH ${maxSubId + 1}`);
    await pgClient.query(`ALTER SEQUENCE payme_expenses_id_seq RESTART WITH ${maxExpId + 1}`);

    console.log('\n========================================');
    console.log('DATA MIGRATION COMPLETE!');
    console.log('========================================');
    console.log(`Categories: ${mysqlCategories.length}`);
    console.log(`Subcategories: ${mysqlSubcategories.length}`);
    console.log(`Expenses: ${mysqlExpenses.length}`);

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await mysqlConn.end();
    await pgClient.end();
  }
}

migrateData().catch(console.error);
