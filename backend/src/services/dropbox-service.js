const { Dropbox, DropboxAuth } = require('dropbox');
const { pool } = require('../config/database');

class DropboxService {
  constructor() {
    this.dbx = null;
    this.dbxAuth = null;
    this.redirectUri = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:3006/api/dropbox/callback';
    this.initialize();
  }

  initialize() {
    const appKey = process.env.DROPBOX_APP_KEY;
    const appSecret = process.env.DROPBOX_APP_SECRET;

    if (appKey && appSecret) {
      this.dbxAuth = new DropboxAuth({
        clientId: appKey,
        clientSecret: appSecret
      });
    }

    // Try to use existing access token
    const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
    if (accessToken) {
      this.dbx = new Dropbox({ accessToken });
    }
  }

  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl() {
    if (!this.dbxAuth) {
      throw new Error('Dropbox not configured. Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET');
    }

    const authUrl = await this.dbxAuth.getAuthenticationUrl(
      this.redirectUri,
      null, // state
      'code',
      'offline', // token_access_type - 'offline' gives us refresh token
      null,
      'none',
      false
    );

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code) {
    if (!this.dbxAuth) {
      throw new Error('Dropbox not configured');
    }

    this.dbxAuth.setCodeVerifier(null);

    const response = await this.dbxAuth.getAccessTokenFromCode(this.redirectUri, code);
    const { access_token, refresh_token, expires_in } = response.result;

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // Save tokens to database
    await this.saveTokens(access_token, refresh_token, expiresAt);

    // Initialize Dropbox with new token
    this.dbx = new Dropbox({ accessToken: access_token });

    return { access_token, refresh_token, expires_at: expiresAt };
  }

  /**
   * Save tokens to database
   */
  async saveTokens(accessToken, refreshToken, expiresAt) {
    // Check if tokens exist
    const [existing] = await pool.query('SELECT id FROM dropbox_tokens LIMIT 1');

    if (existing.length > 0) {
      await pool.query(
        `UPDATE dropbox_tokens SET
          access_token = ?,
          refresh_token = COALESCE(?, refresh_token),
          expires_at = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [accessToken, refreshToken, expiresAt, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO dropbox_tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)`,
        [accessToken, refreshToken, expiresAt]
      );
    }
  }

  /**
   * Load tokens from database and refresh if needed
   */
  async loadTokens() {
    const [rows] = await pool.query('SELECT * FROM dropbox_tokens ORDER BY updated_at DESC LIMIT 1');

    if (rows.length === 0) {
      return null;
    }

    const tokenData = rows[0];

    // Check if token is expired or about to expire (5 min buffer)
    const expiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < fiveMinutes && tokenData.refresh_token) {
      // Refresh the token
      console.log('Dropbox token expired, refreshing...');
      await this.refreshAccessToken(tokenData.refresh_token);
    } else {
      this.dbx = new Dropbox({ accessToken: tokenData.access_token });
    }

    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    if (!this.dbxAuth) {
      throw new Error('Dropbox not configured');
    }

    this.dbxAuth.setRefreshToken(refreshToken);

    await this.dbxAuth.refreshAccessToken();

    const newAccessToken = this.dbxAuth.getAccessToken();
    const expiresAt = this.dbxAuth.getAccessTokenExpiresAt();

    // Save new token
    await this.saveTokens(newAccessToken, null, expiresAt);

    // Initialize Dropbox with new token
    this.dbx = new Dropbox({ accessToken: newAccessToken });

    return newAccessToken;
  }

  /**
   * Get connection status
   */
  async getStatus() {
    try {
      const tokenData = await this.loadTokens();
      if (!tokenData && !process.env.DROPBOX_ACCESS_TOKEN) {
        return { connected: false };
      }

      // Try a simple API call to verify connection
      if (this.dbx) {
        await this.dbx.usersGetCurrentAccount();
        return { connected: true };
      }

      return { connected: false };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  /**
   * Upload file to Dropbox and get shareable link
   */
  async uploadFile(buffer, filename, folder = '/PayMe/EmailImports') {
    // Try to load tokens from DB first
    await this.loadTokens();

    if (!this.dbx) {
      throw new Error('Dropbox not configured. Set DROPBOX_ACCESS_TOKEN in .env');
    }

    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder}/${timestamp}_${safeName}`;

    try {
      // Upload file
      await this.dbx.filesUpload({
        path,
        contents: buffer,
        mode: { '.tag': 'overwrite' }
      });

      // Create shared link
      const linkResponse = await this.dbx.sharingCreateSharedLinkWithSettings({
        path,
        settings: {
          requested_visibility: { '.tag': 'public' }
        }
      });

      // Convert to direct download link
      let url = linkResponse.result.url;
      url = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      url = url.replace('?dl=0', '');

      return {
        success: true,
        path,
        url,
        filename: safeName
      };
    } catch (error) {
      // If link already exists, try to get it
      if (error.error?.error?.['.tag'] === 'shared_link_already_exists') {
        try {
          const links = await this.dbx.sharingListSharedLinks({ path });
          if (links.result.links.length > 0) {
            let url = links.result.links[0].url;
            url = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
            url = url.replace('?dl=0', '');
            return {
              success: true,
              path,
              url,
              filename: safeName
            };
          }
        } catch (e) {
          console.error('Error getting existing link:', e);
        }
      }

      console.error('Dropbox upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file from Dropbox
   */
  async deleteFile(path) {
    await this.loadTokens();

    if (!this.dbx) {
      throw new Error('Dropbox not configured');
    }

    try {
      await this.dbx.filesDeleteV2({ path });
      return { success: true };
    } catch (error) {
      console.error('Dropbox delete error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new DropboxService();
