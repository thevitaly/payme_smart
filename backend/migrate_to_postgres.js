const { Client } = require('pg');

const DATABASE_URL = 'postgresql://migrator:Dabestis123_@168.231.125.70:5432/jvkpro';

async function migrate() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // 1. Create payme_categories
    console.log('Creating payme_categories...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payme_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        order_num INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ payme_categories created');

    // 2. Create payme_subcategories
    console.log('Creating payme_subcategories...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payme_subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES payme_categories(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        order_num INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ payme_subcategories created');

    // 3. Create payme_expenses
    console.log('Creating payme_expenses...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payme_expenses (
        id SERIAL PRIMARY KEY,
        description VARCHAR(500),
        amount DECIMAL(12,2) DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'EUR',
        category_id INTEGER REFERENCES payme_categories(id),
        subcategory_id INTEGER REFERENCES payme_subcategories(id),
        status VARCHAR(50) DEFAULT 'PENDING',
        payment_type VARCHAR(50) DEFAULT 'CASH',
        input_type VARCHAR(50) DEFAULT 'TEXT',
        original_text TEXT,
        transcription TEXT,
        file_path VARCHAR(500),
        dropbox_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confirmed_at TIMESTAMP,
        source VARCHAR(50) DEFAULT 'manual'
      )
    `);
    console.log('✅ payme_expenses created');

    // Create indexes for payme_expenses
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_status ON payme_expenses(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON payme_expenses(category_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_created ON payme_expenses(created_at)`);
    console.log('✅ payme_expenses indexes created');

    // 4. Create gmail_tokens
    console.log('Creating gmail_tokens...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS gmail_tokens (
        id SERIAL PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        email VARCHAR(255),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gmail_email ON gmail_tokens(email)`);
    console.log('✅ gmail_tokens created');

    // 5. Create email_import_audit
    console.log('Creating email_import_audit...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_import_audit (
        id SERIAL PRIMARY KEY,
        email_id VARCHAR(255) NOT NULL,
        email_subject VARCHAR(500),
        email_from VARCHAR(255),
        email_date TIMESTAMP,
        attachment_filename VARCHAR(255),
        dropbox_url VARCHAR(500),
        extracted_data JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        expense_id INTEGER REFERENCES payme_expenses(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_email_id ON email_import_audit(email_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_status ON email_import_audit(status)`);
    console.log('✅ email_import_audit created');

    // 6. Insert default categories
    console.log('\nInserting default categories...');

    const defaultCategories = [
      { name: 'Transports', code: 'transport', order: 1 },
      { name: 'Biroja izdevumi', code: 'office', order: 2 },
      { name: 'Aprīkojums', code: 'equipment', order: 3 },
      { name: 'Komunālie', code: 'utilities', order: 4 },
      { name: 'Mārketings', code: 'marketing', order: 5 },
      { name: 'Citi izdevumi', code: 'other', order: 6 }
    ];

    for (const cat of defaultCategories) {
      await client.query(`
        INSERT INTO payme_categories (name, code, order_num)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [cat.name, cat.code, cat.order]);
    }
    console.log('✅ Default categories inserted');

    // Insert some subcategories
    const subcategories = [
      { catCode: 'transport', name: 'Degviela', code: 'fuel' },
      { catCode: 'transport', name: 'Serviss', code: 'service' },
      { catCode: 'transport', name: 'Apdrošināšana', code: 'insurance' },
      { catCode: 'office', name: 'Kancelejas preces', code: 'supplies' },
      { catCode: 'office', name: 'Programmatūra', code: 'software' },
      { catCode: 'utilities', name: 'Elektrība', code: 'electricity' },
      { catCode: 'utilities', name: 'Internets', code: 'internet' },
    ];

    for (const sub of subcategories) {
      const catResult = await client.query(
        'SELECT id FROM payme_categories WHERE code = $1',
        [sub.catCode]
      );
      if (catResult.rows.length > 0) {
        await client.query(`
          INSERT INTO payme_subcategories (category_id, name, code)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [catResult.rows[0].id, sub.name, sub.code]);
      }
    }
    console.log('✅ Default subcategories inserted');

    console.log('\n========================================');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('========================================');
    console.log('\nCreated tables:');
    console.log('  - payme_categories');
    console.log('  - payme_subcategories');
    console.log('  - payme_expenses');
    console.log('  - gmail_tokens');
    console.log('  - email_import_audit');

  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
