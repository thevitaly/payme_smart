const mysql = require('mysql2/promise');

async function checkSettings() {
  const pool = mysql.createPool({
    host: '45.93.137.27',
    port: 43036,
    user: 'sandconn',
    password: 'v1oArF#-i71x.2025',
    database: 'jvkpro_sandbox'
  });

  try {
    console.log('=== ECOSYSTEM_SETTINGS STRUCTURE ===');
    const [cols] = await pool.query('DESCRIBE ecosystem_settings');
    console.log(cols);

    console.log('\n=== CURRENT SETTINGS ===');
    const [settings] = await pool.query('SELECT * FROM ecosystem_settings LIMIT 5');
    console.log(settings);

    await pool.end();
  } catch(err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

checkSettings();
