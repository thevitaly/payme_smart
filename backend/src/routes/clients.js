const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/clients - List all clients
router.get('/', async (req, res) => {
  try {
    const { search, is_company, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT id, first_name, last_name, phone, email, instagram,
             address, is_company, company_name, company_details,
             registration_number, pvn_number, vat_number,
             legal_address, country,
             bank_name, swift_bic, bank_account,
             total_orders, total_spent
      FROM ecosystem_clients
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (is_company !== undefined) {
      sql += ' AND is_company = ?';
      params.push(is_company === 'true' || is_company === '1');
    }

    sql += ' ORDER BY first_name, last_name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [clients] = await pool.query(sql, params);

    res.json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/clients/:id - Get single client
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [clients] = await pool.query(
      'SELECT * FROM ecosystem_clients WHERE id = ?',
      [id]
    );

    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(clients[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/clients/:id/pvn - Update client PVN info
router.put('/:id/pvn', async (req, res) => {
  try {
    const { id } = req.params;
    const { pvn_number, legal_address, country } = req.body;

    const updates = [];
    const params = [];

    if (pvn_number !== undefined) { updates.push('pvn_number = ?'); params.push(pvn_number); }
    if (legal_address !== undefined) { updates.push('legal_address = ?'); params.push(legal_address); }
    if (country !== undefined) { updates.push('country = ?'); params.push(country); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    await pool.query(
      `UPDATE ecosystem_clients SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ message: 'Client PVN info updated' });
  } catch (error) {
    console.error('Error updating client PVN:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
