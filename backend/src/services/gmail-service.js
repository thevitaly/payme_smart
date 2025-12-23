const { google } = require('googleapis');
const { pool } = require('../config/database');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

class GmailService {
  constructor() {
    this.oauth2Client = null;
    this.initializeOAuth();

    // Ignored senders (spam, bounces, internal)
    this.ignoredSenders = [
      'mailer-daemon@googlemail.com',
      'mailer-daemon@google.com',
      'noreply-dmarc-support@google.com',
      'no-reply@accounts.google.com',
      'info@jvkpro.com'
    ];

    // Invoice-related keywords (multiple languages)
    this.invoiceKeywords = [
      // English
      'invoice', 'bill', 'billing', 'receipt', 'payment', 'subscription',
      'your order', 'order confirmation', 'payment confirmation',
      // Latvian
      'rēķins', 'maksājums', 'apmaksa', 'kvīts', 'pasūtījums',
      // Russian
      'счет', 'счёт', 'оплата', 'квитанция', 'платеж', 'платёж', 'чек',
      // German
      'rechnung', 'zahlung', 'quittung',
      // Common services
      'stripe', 'paypal', 'wise', 'revolut',
      // Known suppliers/companies (38 companies)
      'BITE', 'LMT', 'VENDEN', 'DROŠĪBA DARBA', 'Latvijas ugunsdrošība',
      'GOOGLE CLOUD', 'GRIFS AG', 'GRIFS', 'SENSON AUTO', 'ERKI',
      'GABUS SIA', 'GABUS', 'MB Dailų ekspertai', 'MB Dailų',
      'RKS-K24', 'LR Projects', 'AGROS',
      'INTER CARS', 'AMAZON', 'MAGIC', 'Verifone', 'LU Matemātikas',
      'Handy House', 'xAutomobile', 'LINDSTROM', 'Callgear',
      'APE MOTORS', 'APE DYN', 'Epizode Sound', 'LATTIM', 'Pirus Serviss',
      'DIMA SIA', 'AHAFOONOVS', 'CERTEX', 'Business Education',
      'Euronsteel', 'ENTER', 'OnPmi', 'NESTE LATVIA', 'NESTE', 'R&D'
    ];
  }

  initializeOAuth() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUrl = process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3006/api/gmail/callback';

    if (clientId && clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
    }
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl() {
    if (!this.oauth2Client) {
      throw new Error('Gmail OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    // Save tokens to database
    await this.saveTokens(tokens, email);

    return { tokens, email };
  }

  /**
   * Save tokens to database
   */
  async saveTokens(tokens, email) {
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Check if token exists for this email
    const [existing] = await pool.query('SELECT id FROM gmail_tokens WHERE email = ?', [email]);

    if (existing.length > 0) {
      await pool.query(
        `UPDATE gmail_tokens SET
          access_token = ?,
          refresh_token = COALESCE(?, refresh_token),
          expires_at = ?,
          updated_at = NOW()
        WHERE email = ?`,
        [tokens.access_token, tokens.refresh_token, expiresAt, email]
      );
    } else {
      await pool.query(
        `INSERT INTO gmail_tokens (access_token, refresh_token, email, expires_at) VALUES (?, ?, ?, ?)`,
        [tokens.access_token, tokens.refresh_token, email, expiresAt]
      );
    }
  }

  /**
   * Load tokens from database
   */
  async loadTokens() {
    const [rows] = await pool.query('SELECT * FROM gmail_tokens ORDER BY updated_at DESC LIMIT 1');

    if (rows.length === 0) {
      return null;
    }

    const tokenData = rows[0];
    const tokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : null
    };

    this.oauth2Client.setCredentials(tokens);

    // Check if token needs refresh
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      await this.refreshAccessToken(tokenData.email);
    }

    return { tokens, email: tokenData.email };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(email) {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      await this.saveTokens(credentials, email);
      return credentials;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   */
  async getStatus() {
    try {
      const tokenData = await this.loadTokens();
      if (!tokenData) {
        return { connected: false, email: null };
      }
      return { connected: true, email: tokenData.email };
    } catch (error) {
      return { connected: false, email: null, error: error.message };
    }
  }

  /**
   * Disconnect Gmail
   */
  async disconnect() {
    await pool.query('DELETE FROM gmail_tokens');
    this.oauth2Client.setCredentials({});
    return { disconnected: true };
  }

  /**
   * Fetch emails with attachments OR invoice-related keywords in date range
   */
  async fetchEmailsWithAttachments(startDate, endDate, maxResults = 50) {
    await this.loadTokens();

    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    // Format dates for Gmail query
    const formatDate = (date) => {
      const d = new Date(date);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    };

    const dateRange = `after:${formatDate(startDate)} before:${formatDate(endDate)}`;

    // Build keyword search (invoice, bill, receipt, etc.)
    const keywordSearch = this.invoiceKeywords.map(k => `"${k}"`).join(' OR ');

    // Two-part search:
    // 1. Documents with attachments (PDF, DOC, DOCX, XLS, XLSX only - no images)
    // 2. Emails with invoice keywords (even without attachments)
    const queries = [
      `${dateRange} has:attachment (filename:pdf OR filename:doc OR filename:docx OR filename:xls OR filename:xlsx)`,
      `${dateRange} subject:(${keywordSearch})`
    ];

    const allMessageIds = new Set();
    const allMessages = [];

    for (const query of queries) {
      console.log('Gmail search query:', query.substring(0, 100) + '...');

      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: Math.floor(maxResults / 2)
        });

        const messages = response.data.messages || [];
        for (const msg of messages) {
          if (!allMessageIds.has(msg.id)) {
            allMessageIds.add(msg.id);
            allMessages.push(msg);
          }
        }
      } catch (err) {
        console.error('Query error:', err.message);
      }
    }

    console.log(`Found ${allMessages.length} unique emails`);

    // Get details for each message
    const emails = await Promise.all(
      allMessages.slice(0, maxResults).map(msg => this.getMessageDetails(gmail, msg.id))
    );

    // Filter out ignored senders
    const filtered = emails.filter(email => {
      const fromLower = email.from.toLowerCase();
      const isIgnored = this.ignoredSenders.some(ignored =>
        fromLower.includes(ignored.toLowerCase())
      );
      if (isIgnored) {
        console.log(`Ignoring email from: ${email.from}`);
      }
      return !isIgnored;
    });

    // Mark emails as having attachments or being keyword-based
    return filtered.map(email => ({
      ...email,
      hasDocuments: email.attachments.length > 0,
      isKeywordMatch: !email.attachments.length
    }));
  }

  /**
   * Get message details including attachments info and body text
   */
  async getMessageDetails(gmail, messageId) {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const headers = message.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Extract attachments
    const attachments = this.extractAttachments(message.data.payload);

    // Extract body text (for emails without attachments)
    const bodyText = this.extractBodyText(message.data.payload);

    return {
      id: messageId,
      subject,
      from,
      date: new Date(date).toISOString(),
      attachments,
      bodyText
    };
  }

  /**
   * Extract plain text body from email payload
   */
  extractBodyText(payload, text = '') {
    // Check for plain text part
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      text += decoded;
    }

    // Check for HTML part (fallback, strip tags)
    if (payload.mimeType === 'text/html' && payload.body?.data && !text) {
      const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      // Simple HTML tag removal
      text += decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Recurse into parts
    if (payload.parts) {
      for (const part of payload.parts) {
        text = this.extractBodyText(part, text);
      }
    }

    return text.substring(0, 5000); // Limit to 5000 chars
  }

  /**
   * Extract attachment info from message payload
   * Only documents: PDF, DOC, DOCX, XLS, XLSX (no images - too much spam)
   */
  extractAttachments(payload, attachments = []) {
    // Document MIME types only
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet'
    ];

    // File extensions to allow (fallback check)
    const allowedExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.odt', '.ods'
    ];

    if (payload.parts) {
      for (const part of payload.parts) {
        this.extractAttachments(part, attachments);
      }
    }

    if (payload.filename && payload.body?.attachmentId) {
      const mimeType = (payload.mimeType || '').toLowerCase();
      const filename = payload.filename.toLowerCase();
      const ext = filename.substring(filename.lastIndexOf('.'));

      // Check by MIME type OR by extension
      const isAllowed = allowedMimeTypes.includes(mimeType) ||
                        allowedExtensions.includes(ext);

      if (isAllowed) {
        attachments.push({
          filename: payload.filename,
          mimeType: payload.mimeType,
          attachmentId: payload.body.attachmentId,
          size: payload.body.size || 0
        });
      }
    }

    return attachments;
  }

  /**
   * Download attachment as buffer
   */
  async downloadAttachment(messageId, attachmentId) {
    await this.loadTokens();

    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId
    });

    // Gmail returns base64url encoded data
    const data = attachment.data.data;
    return Buffer.from(data, 'base64');
  }
}

module.exports = new GmailService();
