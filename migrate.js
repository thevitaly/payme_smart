const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: '45.93.137.27',
    port: 43036,
    user: 'sandconn',
    password: 'v1oArF#-i71x.2025',
    database: 'jvkpro_sandbox',
    multipleStatements: true
  });

  try {
    console.log('Starting migration...\n');

    // 1. Add PVN fields to ecosystem_clients if not exist
    console.log('1. Adding PVN fields to ecosystem_clients...');
    const [cols] = await pool.query('DESCRIBE ecosystem_clients');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('pvn_number')) {
      await pool.query('ALTER TABLE ecosystem_clients ADD COLUMN pvn_number VARCHAR(30) DEFAULT NULL');
      console.log('   Added pvn_number column');
    } else {
      console.log('   pvn_number already exists');
    }

    if (!colNames.includes('legal_address')) {
      await pool.query('ALTER TABLE ecosystem_clients ADD COLUMN legal_address VARCHAR(255) DEFAULT NULL');
      console.log('   Added legal_address column');
    } else {
      console.log('   legal_address already exists');
    }

    if (!colNames.includes('country')) {
      await pool.query("ALTER TABLE ecosystem_clients ADD COLUMN country VARCHAR(100) DEFAULT 'Latvija'");
      console.log('   Added country column');
    } else {
      console.log('   country already exists');
    }

    // 2. Create ecosystem_invoices table
    console.log('\n2. Creating ecosystem_invoices table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ecosystem_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(20) NOT NULL UNIQUE,
        client_id INT NOT NULL,
        invoice_date DATE NOT NULL,
        payment_date DATE DEFAULT NULL,
        due_date DATE DEFAULT NULL,
        status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
        payment_method VARCHAR(100) DEFAULT 'Pārskaitījums',

        -- Totals
        subtotal DECIMAL(12, 2) DEFAULT 0.00,
        pvn_rate DECIMAL(5, 2) DEFAULT 21.00,
        pvn_amount DECIMAL(12, 2) DEFAULT 0.00,
        total DECIMAL(12, 2) DEFAULT 0.00,

        -- Client snapshot (in case client data changes later)
        client_name VARCHAR(255) DEFAULT NULL,
        client_pvn VARCHAR(30) DEFAULT NULL,
        client_address VARCHAR(255) DEFAULT NULL,
        client_country VARCHAR(100) DEFAULT 'Latvija',

        notes TEXT DEFAULT NULL,
        created_by INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (client_id) REFERENCES ecosystem_clients(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by) REFERENCES ecosystem_users(id) ON DELETE SET NULL,
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_client_id (client_id),
        INDEX idx_status (status),
        INDEX idx_invoice_date (invoice_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ecosystem_invoices created');

    // 3. Create ecosystem_invoice_items table
    console.log('\n3. Creating ecosystem_invoice_items table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ecosystem_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        description VARCHAR(500) NOT NULL,
        quantity DECIMAL(10, 2) DEFAULT 1.00,
        unit VARCHAR(50) DEFAULT 'gabals(-i)',
        unit_price DECIMAL(12, 2) NOT NULL,

        -- Calculated fields
        amount_net DECIMAL(12, 2) NOT NULL,
        pvn_rate DECIMAL(5, 2) DEFAULT 21.00,
        pvn_amount DECIMAL(12, 2) NOT NULL,
        amount_gross DECIMAL(12, 2) NOT NULL,

        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (invoice_id) REFERENCES ecosystem_invoices(id) ON DELETE CASCADE,
        INDEX idx_invoice_id (invoice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('   ecosystem_invoice_items created');

    // 4. Create company settings if not exist
    console.log('\n4. Adding company settings for invoices...');

    const settingsToInsert = [
      ['invoice_company_name', 'SIA "JVKPRO"', 'Название компании для счетов'],
      ['invoice_reg_number', '40103358805', 'Регистрационный номер'],
      ['invoice_pvn_number', 'LV40103358805', 'PVN номер компании'],
      ['invoice_address', 'Piedrujas iela, 28', 'Адрес компании'],
      ['invoice_city', 'LV1073 Riga, Latvija', 'Город и индекс'],
      ['invoice_bank_account', 'LV40UNLA0055001400447', 'Номер банковского счёта'],
      ['invoice_bank_swift', 'UNLALV2XXXX', 'SWIFT/BIC код'],
      ['invoice_bank_name', 'SEB Banka', 'Название банка'],
      ['invoice_currency', 'EUR', 'Валюта'],
      ['invoice_next_number', '950', 'Следующий номер счёта']
    ];

    for (const [key, value, description] of settingsToInsert) {
      const [existing] = await pool.query(
        'SELECT * FROM ecosystem_settings WHERE setting_key = ?',
        [key]
      );
      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO ecosystem_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
          [key, value, description]
        );
        console.log(`   Added setting: ${key}`);
      } else {
        console.log(`   Setting ${key} already exists`);
      }
    }

    console.log('\n✅ Migration completed successfully!');

    // Show created tables
    const [tables] = await pool.query("SHOW TABLES LIKE 'ecosystem_invoice%'");
    console.log('\nCreated tables:');
    console.log(tables);

    await pool.end();
  } catch(err) {
    console.error('❌ Migration error:', err.message);
    console.error(err);
    await pool.end();
    process.exit(1);
  }
}

migrate();
