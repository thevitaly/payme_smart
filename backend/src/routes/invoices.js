const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { generatePDF } = require('../utils/pdfGenerator');

// Helper: Get next invoice number
async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const [settings] = await pool.query(
    "SELECT setting_value FROM ecosystem_settings WHERE setting_key = 'invoice_next_number'"
  );
  const nextNum = parseInt(settings[0]?.setting_value || '1');

  // Increment for next time
  await pool.query(
    "UPDATE ecosystem_settings SET setting_value = ? WHERE setting_key = 'invoice_next_number'",
    [(nextNum + 1).toString()]
  );

  return `${year}/${nextNum}`;
}

// Helper: Get company settings
async function getCompanySettings() {
  const [settings] = await pool.query(
    "SELECT setting_key, setting_value FROM ecosystem_settings WHERE setting_key LIKE 'invoice_%'"
  );
  const result = {};
  settings.forEach(s => {
    const key = s.setting_key.replace('invoice_', '');
    result[key] = s.setting_value;
  });
  return result;
}

// Helper: Log invoice history
async function logHistory(connection, invoiceId, action, description = null, amount = null, createdBy = 'System') {
  await connection.query(
    `INSERT INTO ecosystem_invoice_history (invoice_id, action, description, amount, created_by) VALUES (?, ?, ?, ?, ?)`,
    [invoiceId, action, description, amount, createdBy]
  );
}

// Helper: Create default reminders for invoice
async function createDefaultReminders(connection, invoiceId) {
  const defaultReminders = [
    { type: 'before_14', days: -14 },
    { type: 'before_7', days: -7 },
    { type: 'after_7', days: 7 },
    { type: 'after_14', days: 14 },
    { type: 'after_30', days: 30 },
    { type: 'after_60', days: 60 },
  ];

  for (const r of defaultReminders) {
    await connection.query(
      `INSERT INTO ecosystem_invoice_reminders (invoice_id, reminder_type, days_offset, is_enabled)
       VALUES (?, ?, ?, false)
       ON CONFLICT DO NOTHING`,
      [invoiceId, r.type, r.days]
    );
  }
}

// Helper: Calculate totals (price entered is WITH PVN included)
function calculateTotals(items, pvnRate = 21) {
  let totalGross = 0;
  let totalNet = 0;
  let totalPvn = 0;

  const calculatedItems = items.map(item => {
    // Price entered is already WITH PVN
    const amountGross = parseFloat(item.quantity) * parseFloat(item.unit_price);
    const amountNet = amountGross / (1 + pvnRate / 100);
    const pvnAmount = amountGross - amountNet;

    totalGross += amountGross;
    totalNet += amountNet;
    totalPvn += pvnAmount;

    return {
      ...item,
      amount_net: amountNet.toFixed(2),
      pvn_rate: pvnRate,
      pvn_amount: pvnAmount.toFixed(2),
      amount_gross: amountGross.toFixed(2)
    };
  });

  return {
    items: calculatedItems,
    subtotal: totalNet.toFixed(2),
    pvn_amount: totalPvn.toFixed(2),
    total: totalGross.toFixed(2)
  };
}

// GET /api/invoices - List all invoices
router.get('/', async (req, res) => {
  try {
    const { status, client_id, from_date, to_date, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT i.*, c.first_name, c.last_name, c.phone, c.email
      FROM ecosystem_invoices i
      LEFT JOIN ecosystem_clients c ON i.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (client_id) {
      sql += ' AND i.client_id = ?';
      params.push(client_id);
    }
    if (from_date) {
      sql += ' AND i.invoice_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      sql += ' AND i.invoice_date <= ?';
      params.push(to_date);
    }
    if (search) {
      sql += ' AND (i.invoice_number LIKE ? OR i.client_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [invoices] = await pool.query(sql, params);

    // Get total count
    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM ecosystem_invoices'
    );

    res.json({
      invoices,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/invoices/settings - Get company settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await getCompanySettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/invoices/settings - Update company settings
router.put('/settings', async (req, res) => {
  try {
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      await pool.query(
        "UPDATE ecosystem_settings SET setting_value = ? WHERE setting_key = ?",
        [value, `invoice_${key}`]
      );
    }

    const settings = await getCompanySettings();
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/invoices/:id - Get single invoice with items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [invoices] = await pool.query(
      `SELECT i.*, c.first_name, c.last_name, c.phone, c.email, c.pvn_number as client_pvn_db
       FROM ecosystem_invoices i
       LEFT JOIN ecosystem_clients c ON i.client_id = c.id
       WHERE i.id = ?`,
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoices[0];

    // Get items
    const [items] = await pool.query(
      'SELECT * FROM ecosystem_invoice_items WHERE invoice_id = ? ORDER BY sort_order',
      [id]
    );

    // Get history/timeline
    const [history] = await pool.query(
      'SELECT * FROM ecosystem_invoice_history WHERE invoice_id = ? ORDER BY created_at DESC',
      [id]
    );

    // Get reminders
    const [reminders] = await pool.query(
      'SELECT * FROM ecosystem_invoice_reminders WHERE invoice_id = ? ORDER BY days_offset',
      [id]
    );

    // Get company settings
    const company = await getCompanySettings();

    res.json({ ...invoice, items, history, reminders, company });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices - Create new invoice
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      client_id,
      invoice_date,
      due_date,
      payment_method = 'Pārskaitījums',
      notes,
      items = [],
      client_name,
      client_pvn,
      client_address,
      client_country = 'Latvija',
      created_by
    } = req.body;

    // Validate
    if (!client_id || !items.length) {
      return res.status(400).json({ error: 'client_id and items are required' });
    }

    // Get invoice number: year/monthday/daily_sequence
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}/${month}${day}`;

    // Count invoices created today to get next sequence number
    const todayStart = `${year}-${month}-${day} 00:00:00`;
    const todayEnd = `${year}-${month}-${day} 23:59:59`;
    const [countResult] = await connection.query(
      "SELECT COUNT(*) as count FROM ecosystem_invoices WHERE created_at BETWEEN ? AND ?",
      [todayStart, todayEnd]
    );
    const dailySequence = (countResult[0]?.count || 0) + 1;
    const invoice_number = `${datePrefix}/${dailySequence}`;

    // Calculate totals
    const { items: calculatedItems, subtotal, pvn_amount, total } = calculateTotals(items);

    // Get client data if not provided
    let finalClientName = client_name;
    let finalClientPvn = client_pvn;
    let finalClientAddress = client_address;
    let finalClientCountry = client_country;

    if (!finalClientName) {
      const [clients] = await connection.query(
        'SELECT first_name, last_name, pvn_number, legal_address, country FROM ecosystem_clients WHERE id = ?',
        [client_id]
      );
      if (clients.length > 0) {
        const c = clients[0];
        finalClientName = `${c.first_name} ${c.last_name || ''}`.trim();
        finalClientPvn = finalClientPvn || c.pvn_number;
        finalClientAddress = finalClientAddress || c.legal_address;
        finalClientCountry = finalClientCountry || c.country || 'Latvija';
      }
    }

    // Insert invoice
    const [result] = await connection.query(
      `INSERT INTO ecosystem_invoices
       (invoice_number, client_id, invoice_date, due_date, payment_method,
        subtotal, pvn_rate, pvn_amount, total,
        client_name, client_pvn, client_address, client_country, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 21.00, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [invoice_number, client_id, invoice_date || new Date().toISOString().split('T')[0],
       due_date, payment_method, subtotal, pvn_amount, total,
       finalClientName, finalClientPvn, finalClientAddress, finalClientCountry, notes, created_by]
    );

    const invoiceId = result[0].id;

    // Insert items
    for (let i = 0; i < calculatedItems.length; i++) {
      const item = calculatedItems[i];
      await connection.query(
        `INSERT INTO ecosystem_invoice_items
         (invoice_id, description, quantity, unit, unit_price, amount_net, pvn_rate, pvn_amount, amount_gross, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.description, item.quantity, item.unit || 'gabals(-i)',
         item.unit_price, item.amount_net, item.pvn_rate, item.pvn_amount, item.amount_gross, i]
      );
    }

    // Log history: created
    await logHistory(connection, invoiceId, 'created', `Rēķins Nr. ${invoice_number}`, parseFloat(total), created_by || 'System');

    // Create default reminders
    await createDefaultReminders(connection, invoiceId);

    await connection.commit();

    res.status(201).json({
      id: invoiceId,
      invoice_number,
      message: 'Invoice created successfully'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/invoices/:id - Update invoice
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      invoice_date,
      due_date,
      payment_date,
      status,
      payment_method,
      notes,
      items,
      client_name,
      client_pvn,
      client_address,
      client_country
    } = req.body;

    // Build update query
    const updates = [];
    const params = [];

    if (invoice_date !== undefined) { updates.push('invoice_date = ?'); params.push(invoice_date); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }
    if (payment_date !== undefined) { updates.push('payment_date = ?'); params.push(payment_date); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (payment_method !== undefined) { updates.push('payment_method = ?'); params.push(payment_method); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (client_name !== undefined) { updates.push('client_name = ?'); params.push(client_name); }
    if (client_pvn !== undefined) { updates.push('client_pvn = ?'); params.push(client_pvn); }
    if (client_address !== undefined) { updates.push('client_address = ?'); params.push(client_address); }
    if (client_country !== undefined) { updates.push('client_country = ?'); params.push(client_country); }

    // If items provided, recalculate totals
    if (items && items.length > 0) {
      const { items: calculatedItems, subtotal, pvn_amount, total } = calculateTotals(items);

      updates.push('subtotal = ?', 'pvn_amount = ?', 'total = ?');
      params.push(subtotal, pvn_amount, total);

      // Delete old items
      await connection.query('DELETE FROM ecosystem_invoice_items WHERE invoice_id = ?', [id]);

      // Insert new items
      for (let i = 0; i < calculatedItems.length; i++) {
        const item = calculatedItems[i];
        await connection.query(
          `INSERT INTO ecosystem_invoice_items
           (invoice_id, description, quantity, unit, unit_price, amount_net, pvn_rate, pvn_amount, amount_gross, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, item.description, item.quantity, item.unit || 'gabals(-i)',
           item.unit_price, item.amount_net, item.pvn_rate, item.pvn_amount, item.amount_gross, i]
        );
      }
    }

    if (updates.length > 0) {
      // Check if this is a payment cancellation (status changing from 'paid' to something else)
      let wasPaid = false;
      if (status !== undefined && status !== 'paid') {
        const [currentInvoice] = await connection.query('SELECT status, total FROM ecosystem_invoices WHERE id = ?', [id]);
        if (currentInvoice[0]?.status === 'paid') {
          wasPaid = true;
        }
      }

      params.push(id);
      await connection.query(
        `UPDATE ecosystem_invoices SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      // Log history
      if (wasPaid) {
        await logHistory(connection, id, 'payment_cancelled', 'Apmaksa atcelta', null, 'System');
      } else {
        await logHistory(connection, id, 'edited', 'Rēķins rediģēts', null, 'System');
      }
    }

    await connection.commit();

    res.json({ message: 'Invoice updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Items will be deleted automatically due to CASCADE
    const [result, fields] = await pool.query('DELETE FROM ecosystem_invoices WHERE id = ?', [id]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices/:id/mark-paid - Mark invoice as paid
router.post('/:id/mark-paid', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { payment_date } = req.body;

    // Get invoice total
    const [invoices] = await connection.query('SELECT total FROM ecosystem_invoices WHERE id = ?', [id]);
    const total = invoices[0]?.total || 0;

    await connection.query(
      `UPDATE ecosystem_invoices SET status = 'paid', payment_date = ? WHERE id = ?`,
      [payment_date || new Date().toISOString().split('T')[0], id]
    );

    // Log history: paid
    await logHistory(connection, id, 'paid', 'Pilnībā apmaksāts', parseFloat(total), 'System');

    await connection.commit();

    res.json({ message: 'Invoice marked as paid' });
  } catch (error) {
    await connection.rollback();
    console.error('Error marking invoice as paid:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/invoices/:id/reminders - Update reminder settings
router.put('/:id/reminders', async (req, res) => {
  try {
    const { id } = req.params;
    const { reminders } = req.body; // Array of { reminder_type, is_enabled }

    if (!reminders || !Array.isArray(reminders)) {
      return res.status(400).json({ error: 'reminders array required' });
    }

    for (const r of reminders) {
      await pool.query(
        `UPDATE ecosystem_invoice_reminders SET is_enabled = ? WHERE invoice_id = ? AND reminder_type = ?`,
        [r.is_enabled ? true : false, id, r.reminder_type]
      );
    }

    // Return updated reminders
    const [updatedReminders] = await pool.query(
      'SELECT * FROM ecosystem_invoice_reminders WHERE invoice_id = ? ORDER BY days_offset',
      [id]
    );

    res.json({ reminders: updatedReminders });
  } catch (error) {
    console.error('Error updating reminders:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/invoices/:id/pdf - Generate and download PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice with items
    const [invoices] = await pool.query(
      `SELECT i.*, c.first_name, c.last_name, c.phone, c.email
       FROM ecosystem_invoices i
       LEFT JOIN ecosystem_clients c ON i.client_id = c.id
       WHERE i.id = ?`,
      [id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoices[0];

    const [items] = await pool.query(
      'SELECT * FROM ecosystem_invoice_items WHERE invoice_id = ? ORDER BY sort_order',
      [id]
    );

    const company = await getCompanySettings();

    // Generate PDF
    const pdfResult = await generatePDF(invoice, items, company);

    // Ensure it's a proper Buffer (Puppeteer returns Uint8Array)
    const pdfBuffer = Buffer.from(pdfResult);

    // Set headers for PDF download
    const filename = `Rekins_${invoice.invoice_number.replace('/', '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
