const { Client } = require('pg');

async function checkPostgres() {
  const client = new Client({
    connectionString: 'postgresql://migrator:Dabestis123_@168.231.125.70:5432/jvkpro'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Get all tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('=== ТАБЛИЦЫ В PostgreSQL ===');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    console.log(`\nВсего таблиц: ${tablesResult.rows.length}`);

    // Get columns for each table
    console.log('\n=== СТРУКТУРА ТАБЛИЦ ===\n');
    for (const row of tablesResult.rows) {
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [row.table_name]);

      console.log(`📋 ${row.table_name}:`);
      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = col.column_default ? ` DEFAULT ${col.column_default.substring(0, 30)}` : '';
        console.log(`   ${col.column_name}: ${col.data_type} ${nullable}${def}`);
      });
      console.log('');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

checkPostgres();
