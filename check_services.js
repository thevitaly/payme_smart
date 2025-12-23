const mysql = require('mysql2/promise');

async function checkServices() {
  const pool = mysql.createPool({
    host: '45.93.137.27',
    port: 43036,
    user: 'sandconn',
    password: 'v1oArF#-i71x.2025',
    database: 'jvkpro_sandbox'
  });

  try {
    console.log('=== ECOSYSTEM_SERVICES STRUCTURE ===');
    const [cols] = await pool.query('DESCRIBE ecosystem_services');
    console.log(cols);

    console.log('\n=== SAMPLE SERVICES ===');
    const [services] = await pool.query('SELECT * FROM ecosystem_services LIMIT 10');
    console.log(services);

    await pool.end();
  } catch(err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

checkServices();
