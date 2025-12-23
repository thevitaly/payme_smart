const OpenAI = require('openai');
const { PDFExtract } = require('pdf.js-extract');
const XLSX = require('xlsx');

const pdfExtract = new PDFExtract();

class OpenAIService {
  constructor() {
    this.client = null;
    this.initialize();
  }

  initialize() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  /**
   * Determine file type from filename and mimeType
   */
  getFileType(filename, mimeType) {
    const lowerFilename = filename.toLowerCase();

    // PDF
    if (mimeType === 'application/pdf' || lowerFilename.endsWith('.pdf')) {
      return 'pdf';
    }

    // Excel
    if (mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerFilename.endsWith('.xls') || lowerFilename.endsWith('.xlsx')) {
      return 'excel';
    }

    // Word (skip for now - complex format)
    if (mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerFilename.endsWith('.doc') || lowerFilename.endsWith('.docx')) {
      return 'word';
    }

    // Images
    if (mimeType.startsWith('image/') ||
        lowerFilename.endsWith('.jpg') || lowerFilename.endsWith('.jpeg') ||
        lowerFilename.endsWith('.png') || lowerFilename.endsWith('.gif')) {
      return 'image';
    }

    return 'unknown';
  }

  /**
   * Extract invoice data from document (PDF, Excel, Image)
   */
  async extractInvoiceData(buffer, mimeType, filename) {
    if (!this.client) {
      throw new Error('OpenAI not configured. Set OPENAI_API_KEY in .env');
    }

    const fileType = this.getFileType(filename, mimeType);
    console.log(`[OpenAI] Processing: ${filename}, mimeType: ${mimeType}, fileType: ${fileType}`);

    switch (fileType) {
      case 'pdf':
        return this.extractFromPdf(buffer, filename);
      case 'excel':
        return this.extractFromExcel(buffer, filename);
      case 'image':
        return this.extractFromImage(buffer, mimeType, filename);
      case 'word':
        return {
          success: false,
          error: 'Word documents not supported yet',
          filename
        };
      default:
        return {
          success: false,
          error: `Unsupported file format: ${mimeType}`,
          filename
        };
    }
  }

  /**
   * Extract data from PDF using pdf.js-extract + GPT
   */
  async extractFromPdf(buffer, filename) {
    console.log('[PDF] Starting extraction for:', filename);
    try {
      console.log('[PDF] Calling pdf.js-extract, buffer size:', buffer.length);

      // pdf.js-extract works with buffers directly
      const options = {};
      const pdfData = await pdfExtract.extractBuffer(buffer, options);

      // Extract text from all pages
      let text = '';
      for (const page of pdfData.pages) {
        for (const item of page.content) {
          if (item.str) {
            text += item.str + ' ';
          }
        }
        text += '\n';
      }

      console.log('[PDF] Text extracted, length:', text.length);
      console.log('[PDF] First 300 chars:', text.substring(0, 300));

      if (!text || text.trim().length < 10) {
        console.log('PDF appears to be scanned/image-based, no text extracted');
        return {
          success: false,
          error: 'PDF is scanned/image-based, no text could be extracted',
          filename
        };
      }

      // Send text to GPT for analysis
      const prompt = `Analyze this invoice/receipt document text and extract the following information.
Return ONLY a valid JSON object with these fields (use null if not found):

{
  "sender": "Company or person name who issued the invoice",
  "amount": 123.45,
  "currency": "EUR",
  "date": "2024-12-20",
  "description": "Brief description of what the invoice is for",
  "invoiceNumber": "Invoice number if visible",
  "isInvoice": true
}

Important:
- "sender" is the company/person who SENT the invoice (vendor/supplier), NOT the recipient
- "amount" must be a number (not string), representing the total amount to pay
- "date" must be in YYYY-MM-DD format
- "currency" should be 3-letter code (EUR, USD, etc.)
- "isInvoice" should be true if this looks like an invoice/receipt, false otherwise
- If you can't determine a value, use null

Document text:
${text.substring(0, 6000)}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('GPT response for PDF:', content.substring(0, 200));

      return this.parseGptResponse(content, filename);
    } catch (error) {
      console.error('PDF extraction error:', error);
      return {
        success: false,
        error: error.message,
        filename
      };
    }
  }

  /**
   * Extract data from Excel file using xlsx + GPT
   */
  async extractFromExcel(buffer, filename) {
    console.log('[Excel] Starting extraction for:', filename);
    try {
      // Parse Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const allText = [];

      // Extract text from all sheets
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        allText.push(`Sheet: ${sheetName}\n${csv}`);
      }

      const text = allText.join('\n\n');
      console.log('[Excel] Text extracted, length:', text.length);
      console.log('[Excel] First 200 chars:', text.substring(0, 200));

      if (!text || text.trim().length < 10) {
        return {
          success: false,
          error: 'Excel file is empty or could not be read',
          filename
        };
      }

      // Send text to GPT for analysis
      const prompt = `Analyze this invoice/receipt document data (from Excel spreadsheet) and extract the following information.
Return ONLY a valid JSON object with these fields (use null if not found):

{
  "sender": "Company or person name who issued the invoice",
  "amount": 123.45,
  "currency": "EUR",
  "date": "2024-12-20",
  "description": "Brief description of what the invoice is for",
  "invoiceNumber": "Invoice number if visible",
  "isInvoice": true
}

Important:
- "sender" is the company/person who SENT the invoice (vendor/supplier), NOT the recipient
- "amount" must be a number (not string), representing the total amount to pay
- "date" must be in YYYY-MM-DD format
- "currency" should be 3-letter code (EUR, USD, etc.)
- "isInvoice" should be true if this looks like an invoice/receipt, false otherwise
- If you can't determine a value, use null

Document data:
${text.substring(0, 6000)}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('GPT response for Excel:', content.substring(0, 200));

      return this.parseGptResponse(content, filename);
    } catch (error) {
      console.error('Excel extraction error:', error);
      return {
        success: false,
        error: error.message,
        filename
      };
    }
  }

  /**
   * Extract data from image using GPT-4V
   */
  async extractFromImage(buffer, mimeType, filename) {
    try {
      const base64Image = buffer.toString('base64');
      const imageUrl = `data:${mimeType};base64,${base64Image}`;

      const prompt = `Analyze this invoice/receipt document and extract the following information.
Return ONLY a valid JSON object with these fields (use null if not found):

{
  "sender": "Company or person name who issued the invoice",
  "amount": 123.45,
  "currency": "EUR",
  "date": "2024-12-20",
  "description": "Brief description of what the invoice is for",
  "invoiceNumber": "Invoice number if visible",
  "isInvoice": true
}

Important:
- "sender" is the company/person who SENT the invoice (vendor/supplier), NOT the recipient
- "amount" must be a number (not string), representing the total amount to pay
- "date" must be in YYYY-MM-DD format
- "currency" should be 3-letter code (EUR, USD, etc.)
- "isInvoice" should be true if this looks like an invoice/receipt, false otherwise
- If you can't determine a value, use null

Analyze the document now:`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high'
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('GPT-4V raw response:', content.substring(0, 200));

      return this.parseGptResponse(content, filename);
    } catch (error) {
      console.error('Image extraction error:', error);
      return {
        success: false,
        error: error.message,
        filename
      };
    }
  }

  /**
   * Parse GPT response and extract JSON data
   */
  parseGptResponse(content, filename) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            sender: parsed.sender || null,
            amount: typeof parsed.amount === 'number' ? parsed.amount : parseFloat(parsed.amount) || null,
            currency: parsed.currency || 'EUR',
            date: parsed.date || null,
            description: parsed.description || null,
            invoiceNumber: parsed.invoiceNumber || null,
            isInvoice: parsed.isInvoice !== false
          },
          filename
        };
      } catch (e) {
        console.error('JSON parse error:', e);
      }
    }

    return {
      success: false,
      error: 'Could not parse JSON from GPT response',
      filename
    };
  }

  /**
   * Extract invoice data from email text (no attachment)
   */
  async extractFromEmailText(text, subject, from) {
    if (!this.client) {
      throw new Error('OpenAI not configured. Set OPENAI_API_KEY in .env');
    }

    console.log('[OpenAI] Processing email text, length:', text.length);

    const prompt = `Analyze this email text and extract payment/invoice information.
Return ONLY a valid JSON object with these fields (use null if not found):

{
  "sender": "Company or person name who sent the invoice/payment request",
  "amount": 123.45,
  "currency": "EUR",
  "date": "2024-12-20",
  "description": "Brief description of what the payment is for",
  "invoiceNumber": "Invoice or reference number if visible",
  "isInvoice": true
}

Important:
- "sender" is the company/person requesting payment (from email header: ${from})
- "amount" must be a number (not string), representing the total amount
- "date" must be in YYYY-MM-DD format
- "currency" should be 3-letter code (EUR, USD, etc.)
- "isInvoice" should be true if this looks like an invoice/payment request
- If you can't determine a value, use null

Email subject: ${subject}
Email from: ${from}
Email text:
${text.substring(0, 4000)}`;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.choices[0]?.message?.content || '';
      console.log('GPT response for email text:', content.substring(0, 200));

      return this.parseGptResponse(content, 'email_text');
    } catch (error) {
      console.error('Email text extraction error:', error);
      return {
        success: false,
        error: error.message,
        filename: 'email_text'
      };
    }
  }

  /**
   * Batch process multiple attachments
   */
  async processMultipleAttachments(attachments) {
    const results = [];

    for (const attachment of attachments) {
      try {
        const result = await this.extractInvoiceData(
          attachment.buffer,
          attachment.mimeType,
          attachment.filename
        );
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          filename: attachment.filename
        });
      }
    }

    return results;
  }
}

module.exports = new OpenAIService();
