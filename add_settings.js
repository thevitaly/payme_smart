const mysql = require('mysql2/promise');

async function addSettings() {
  const pool = mysql.createPool({
    host: '45.93.137.27',
    port: 43036,
    user: 'sandconn',
    password: 'v1oArF#-i71x.2025',
    database: 'jvkpro_sandbox'
  });

  try {
    console.log('Adding company settings for invoices...\n');

    const settingsToInsert = [
      ['invoice_company_name', 'SIA "JVKPRO"'],
      ['invoice_reg_number', '40103358805'],
      ['invoice_pvn_number', 'LV40103358805'],
      ['invoice_address', 'Piedrujas iela, 28'],
      ['invoice_city', 'LV1073 Riga, Latvija'],
      ['invoice_bank_account', 'LV40UNLA0055001400447'],
      ['invoice_bank_swift', 'UNLALV2XXXX'],
      ['invoice_bank_name', 'SEB Banka'],
      ['invoice_currency', 'EUR'],
      ['invoice_next_number', '950']
    ];

    for (const [key, value] of settingsToInsert) {
      const [existing] = await pool.query(
        'SELECT * FROM ecosystem_settings WHERE setting_key = ?',
        [key]
      );
      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO ecosystem_settings (setting_key, setting_value) VALUES (?, ?)',
          [key, value]
        );
        console.log(`✅ Added setting: ${key} = ${value}`);
      } else {
        console.log(`⏭️ Setting ${key} already exists`);
      }
    }

    console.log('\n✅ Settings migration completed!');

    // Verify all invoice-related settings
    console.log('\n=== INVOICE SETTINGS ===');
    const [settings] = await pool.query("SELECT * FROM ecosystem_settings WHERE setting_key LIKE 'invoice%'");
    console.log(settings);

    await pool.end();
  } catch(err) {
    console.error('❌ Error:', err.message);
    await pool.end();
  }
}

addSettings();
