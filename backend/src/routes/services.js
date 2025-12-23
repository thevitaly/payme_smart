const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/services - List all active services
router.get('/', async (req, res) => {
  try {
    const [services] = await pool.query(`
      SELECT id, name, base_price, description
      FROM ecosystem_services
      WHERE is_active = true
      ORDER BY sort_order, name
    `);

    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
