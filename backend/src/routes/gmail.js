const express = require('express');
const router = express.Router();
const gmailService = require('../services/gmail-service');
const openaiService = require('../services/openai-service');
const dropboxService = require('../services/dropbox-service');
const { pool } = require('../config/database');

/**
 * GET /api/gmail/auth-url
 * Get OAuth authorization URL
 */
router.get('/auth-url', (req, res) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/gmail/callback
 * OAuth callback - exchange code for tokens
 */
router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code not provided');
  }

  try {
    const { email } = await gmailService.getTokensFromCode(code);

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
    res.redirect(`${frontendUrl}?gmail_connected=true&email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5175';
    res.redirect(`${frontendUrl}?gmail_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/gmail/status
 * Check Gmail connection status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await gmailService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/disconnect
 * Disconnect Gmail account
 */
router.post('/disconnect', async (req, res) => {
  try {
    const result = await gmailService.disconnect();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/fetch-emails
 * Fetch emails with attachments in date range
 */
router.post('/fetch-emails', async (req, res) => {
  const { startDate, endDate, maxResults = 50 } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate required' });
  }

  try {
    const emails = await gmailService.fetchEmailsWithAttachments(
      new Date(startDate),
      new Date(endDate),
      maxResults
    );

    res.json({
      success: true,
      count: emails.length,
      emails
    });
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/process-attachment
 * Process a single attachment with GPT-4V
 */
router.post('/process-attachment', async (req, res) => {
  const { messageId, attachment } = req.body;

  if (!messageId || !attachment) {
    return res.status(400).json({ error: 'messageId and attachment required' });
  }

  try {
    // Download attachment from Gmail
    console.log(`Downloading attachment: ${attachment.filename}`);
    const buffer = await gmailService.downloadAttachment(messageId, attachment.attachmentId);

    // Upload to Dropbox
    console.log(`Uploading to Dropbox: ${attachment.filename}`);
    const uploadResult = await dropboxService.uploadFile(buffer, attachment.filename);

    if (!uploadResult.success) {
      throw new Error(`Dropbox upload failed: ${uploadResult.error}`);
    }

    // Extract data with GPT-4V
    console.log(`Processing with GPT-4V: ${attachment.filename}`);
    const extractionResult = await openaiService.extractInvoiceData(
      buffer,
      attachment.mimeType,
      attachment.filename
    );

    res.json({
      success: true,
      dropboxUrl: uploadResult.url,
      dropboxPath: uploadResult.path,
      extraction: extractionResult
    });
  } catch (error) {
    console.error('Process attachment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/process-email-text
 * Process email text (for emails without attachments) with GPT
 */
router.post('/process-email-text', async (req, res) => {
  const { messageId, subject, from, bodyText } = req.body;

  if (!messageId || !bodyText) {
    return res.status(400).json({ error: 'messageId and bodyText required' });
  }

  try {
    console.log(`Processing email text for: ${subject}`);

    // Extract data with GPT
    const extractionResult = await openaiService.extractFromEmailText(bodyText, subject, from);

    res.json({
      success: true,
      extraction: extractionResult,
      emailText: bodyText.substring(0, 500) // Return truncated text for display
    });
  } catch (error) {
    console.error('Process email text error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/accept-invoice
 * Accept processed invoice and create expense
 */
router.post('/accept-invoice', async (req, res) => {
  const {
    emailId,
    emailSubject,
    emailFrom,
    emailDate,
    attachmentFilename,
    dropboxUrl,
    emailText,
    extractedData,
    categoryId,
    subcategoryId
  } = req.body;

  try {
    // Build original_text: include email text if available (for text-only emails)
    const originalText = emailText
      ? `Email: ${emailSubject} | From: ${emailFrom}\n\n${emailText}`
      : `Email: ${emailSubject} | From: ${emailFrom}`;

    // Create expense in payme_expenses
    const [expenseResult] = await pool.query(
      `INSERT INTO payme_expenses
        (description, amount, currency, category_id, subcategory_id, status,
         payment_type, input_type, original_text, dropbox_url, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'BANK', 'EMAIL', ?, ?, NOW(), NOW())
       RETURNING id`,
      [
        extractedData.description || `Invoice from ${extractedData.sender}`,
        extractedData.amount || 0,
        extractedData.currency || 'EUR',
        categoryId || null,
        subcategoryId || null,
        originalText,
        dropboxUrl || null
      ]
    );

    const expenseId = expenseResult[0].id;

    // Create audit record
    await pool.query(
      `INSERT INTO email_import_audit
        (email_id, email_subject, email_from, email_date, attachment_filename,
         dropbox_url, extracted_data, status, expense_id, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, NOW())`,
      [
        emailId,
        emailSubject,
        emailFrom,
        emailDate ? new Date(emailDate) : null,
        attachmentFilename,
        dropboxUrl,
        JSON.stringify(extractedData),
        expenseId
      ]
    );

    res.json({
      success: true,
      expenseId,
      message: 'Invoice accepted and expense created'
    });
  } catch (error) {
    console.error('Accept invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gmail/reject-invoice
 * Reject processed invoice (just create audit record)
 */
router.post('/reject-invoice', async (req, res) => {
  const {
    emailId,
    emailSubject,
    emailFrom,
    emailDate,
    attachmentFilename,
    dropboxUrl,
    extractedData
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO email_import_audit
        (email_id, email_subject, email_from, email_date, attachment_filename,
         dropbox_url, extracted_data, status, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', NOW())`,
      [
        emailId,
        emailSubject,
        emailFrom,
        emailDate ? new Date(emailDate) : null,
        attachmentFilename,
        dropboxUrl,
        JSON.stringify(extractedData)
      ]
    );

    res.json({
      success: true,
      message: 'Invoice rejected'
    });
  } catch (error) {
    console.error('Reject invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/gmail/audit
 * Get import audit history
 */
router.get('/audit', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM email_import_audit ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
