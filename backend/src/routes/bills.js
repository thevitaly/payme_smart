const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');

// Base path for uploads (adjust if files are stored elsewhere)
const UPLOADS_BASE = process.env.UPLOADS_PATH || '/var/www/payme-bot/uploads';

// GET /api/bills - List all expenses with category info
router.get('/', async (req, res) => {
  try {
    const [expenses] = await pool.query(`
      SELECT
        e.id,
        e.description,
        e.amount,
        e.currency,
        e.status,
        e.payment_type,
        e.input_type,
        e.original_text,
        e.transcription,
        e.file_path,
        e.dropbox_url,
        e.created_at,
        e.confirmed_at,
        c.name as category_name,
        c.code as category_code,
        s.name as subcategory_name,
        s.code as subcategory_code
      FROM payme_expenses e
      LEFT JOIN payme_categories c ON e.category_id = c.id
      LEFT JOIN payme_subcategories s ON e.subcategory_id = s.id
      WHERE e.status = 'CONFIRMED'
      ORDER BY e.created_at DESC
    `);

    // Add file URL for each expense - prioritize dropbox_url
    const result = expenses.map(exp => ({
      ...exp,
      file_url: exp.dropbox_url || null
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bills/file/:id - Serve file for expense
router.get('/file/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT file_path, input_type, dropbox_url FROM payme_expenses WHERE id = ?',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const expense = rows[0];

    // If dropbox URL exists, redirect to it
    if (expense.dropbox_url) {
      return res.redirect(expense.dropbox_url);
    }

    if (!expense.file_path) {
      return res.status(404).json({ error: 'No file attached' });
    }

    // Build full path - file_path is like "uploads/photo_xxx.jpg"
    const fileName = path.basename(expense.file_path);
    const filePath = path.join(UPLOADS_BASE, fileName);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server', path: filePath });
    }

    // Set content type based on file extension
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bills/categories - List all categories with subcategories
router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT id, name, code, description
      FROM payme_categories
      WHERE is_active = true
      ORDER BY order_num
    `);

    const [subcategories] = await pool.query(`
      SELECT id, category_id, name, code
      FROM payme_subcategories
      WHERE is_active = true
      ORDER BY order_num
    `);

    // Group subcategories by category
    const result = categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.category_id === cat.id)
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bills/summary - Get summary by category
router.get('/summary', async (req, res) => {
  try {
    const [summary] = await pool.query(`
      SELECT
        c.name as category,
        c.code as category_code,
        COUNT(e.id) as count,
        SUM(e.amount) as total
      FROM payme_expenses e
      LEFT JOIN payme_categories c ON e.category_id = c.id
      WHERE e.status = 'CONFIRMED'
      GROUP BY c.id, c.name, c.code
      ORDER BY total DESC
    `);

    const [overall] = await pool.query(`
      SELECT
        COUNT(*) as total_count,
        SUM(amount) as total_amount
      FROM payme_expenses
      WHERE status = 'CONFIRMED'
    `);

    res.json({
      byCategory: summary,
      overall: overall[0]
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/bills/:id - Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense exists
    const [rows] = await pool.query('SELECT id FROM payme_expenses WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Delete the expense
    await pool.query('DELETE FROM payme_expenses WHERE id = ?', [id]);

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
