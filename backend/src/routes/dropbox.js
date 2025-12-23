const express = require('express');
const router = express.Router();
const dropboxService = require('../services/dropbox-service');

/**
 * GET /api/dropbox/auth-url
 * Get OAuth authorization URL
 */
router.get('/auth-url', async (req, res) => {
  try {
    const authUrl = await dropboxService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/dropbox/callback
 * OAuth callback - exchange code for tokens
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    await dropboxService.getTokensFromCode(code);

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
    res.redirect(`${frontendUrl}?dropbox_connected=true`);
  } catch (error) {
    console.error('Dropbox OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
    res.redirect(`${frontendUrl}?dropbox_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/dropbox/status
 * Check Dropbox connection status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await dropboxService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
