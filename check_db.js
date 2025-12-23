const mysql = require('mysql2/promise');

async function checkDB() {
  const pool = mysql.createPool({
    host: '45.93.137.27',
    port: 43036,
    user: 'sandconn',
    password: 'v1oArF#-i71x.2025',
    database: 'jvkpro_sandbox'
  });

  try {
    // List ecosystem tables
    console.log('=== ECOSYSTEM TABLES ===');
    const [tables] = await pool.query("SHOW TABLES LIKE 'ecosystem%'");
    console.log(tables);

    // Check if ecosystem_users exists and its structure
    console.log('\n=== ECOSYSTEM_USERS STRUCTURE ===');
    const [cols] = await pool.query('DESCRIBE ecosystem_users');
    console.log(cols);

    // Sample data from ecosystem_users
    console.log('\n=== SAMPLE USER DATA ===');
    const [users] = await pool.query('SELECT * FROM ecosystem_users LIMIT 2');
    console.log(users);

    // Check ecosystem_clients if exists
    console.log('\n=== ECOSYSTEM_CLIENTS STRUCTURE ===');
    try {
      const [clientCols] = await pool.query('DESCRIBE ecosystem_clients');
      console.log(clientCols);
    } catch(e) {
      console.log('ecosystem_clients не существует');
    }

    await pool.end();
  } catch(err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

checkDB();
