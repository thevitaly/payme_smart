require('dotenv').config();
const mysql = require('mysql2/promise');

async function createTables() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  console.log('Connected to database');

  // Create gmail_tokens table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      email VARCHAR(255),
      expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    )
  `);
  console.log('✅ Created gmail_tokens table');

  // Create email_import_audit table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS email_import_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email_id VARCHAR(255) NOT NULL,
      email_subject VARCHAR(500),
      email_from VARCHAR(255),
      email_date TIMESTAMP NULL,
      attachment_filename VARCHAR(255),
      dropbox_url VARCHAR(500),
      extracted_data JSON,
      status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
      expense_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL,
      INDEX idx_email_id (email_id),
      INDEX idx_status (status),
      INDEX idx_expense_id (expense_id)
    )
  `);
  console.log('✅ Created email_import_audit table');

  await connection.end();
  console.log('\n✅ All tables created successfully!');
}

createTables().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
