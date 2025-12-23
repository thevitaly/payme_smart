const puppeteer = require('puppeteer');

function formatNumber(num) {
  return parseFloat(num).toFixed(2).replace('.', ',');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function numberToWordsLV(num) {
  if (num === 0) return 'nulle';

  const ones = ['', 'viens', 'divi', 'trīs', 'četri', 'pieci', 'seši', 'septiņi', 'astoņi', 'deviņi'];
  const teens = ['desmit', 'vienpadsmit', 'divpadsmit', 'trīspadsmit', 'četrpadsmit', 'piecpadsmit', 'sešpadsmit', 'septiņpadsmit', 'astoņpadsmit', 'deviņpadsmit'];
  const tens = ['', '', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit', 'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit'];
  const hundreds = ['', 'simts', 'divi simti', 'trīs simti', 'četri simti', 'pieci simti', 'seši simti', 'septiņi simti', 'astoņi simti', 'deviņi simti'];

  let result = [];

  // Thousands
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    if (thousands === 1) {
      result.push('tūkstotis');
    } else {
      result.push(ones[thousands] + ' tūkstoši');
    }
    num %= 1000;
  }

  // Hundreds
  if (num >= 100) {
    result.push(hundreds[Math.floor(num / 100)]);
    num %= 100;
  }

  // Tens and ones
  if (num >= 20) {
    result.push(tens[Math.floor(num / 10)]);
    num %= 10;
  } else if (num >= 10) {
    result.push(teens[num - 10]);
    num = 0;
  }

  if (num > 0) {
    result.push(ones[num]);
  }

  return result.filter(Boolean).join(' ');
}

function formatEurWords(amount) {
  const [euros, cents] = amount.toFixed(2).split('.');
  const words = numberToWordsLV(parseInt(euros));
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} EUR ${cents} centi`;
}

function getPaymentTermDays(invoiceDate, dueDate) {
  if (!dueDate) return null;
  const start = new Date(invoiceDate);
  const end = new Date(dueDate);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

function generateInvoiceHTML(invoice, items, company) {
  const paymentTermDays = getPaymentTermDays(invoice.invoice_date, invoice.due_date);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; padding: 30px 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .logo { font-size: 42px; font-weight: 900; font-family: 'Arial Black', sans-serif; letter-spacing: -1px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 22px; font-weight: bold; margin-bottom: 5px; }
    .invoice-title .page { color: #9ca3af; margin-left: 20px; }
    .invoice-dates { border-top: 2px solid #d1d5db; padding-top: 8px; margin-top: 5px; }
    .invoice-dates table { margin-left: auto; }
    .invoice-dates td { padding: 2px 0; }
    .invoice-dates td:first-child { font-weight: 600; color: #6b7280; padding-right: 15px; }

    .parties-box { border: 1px solid #d1d5db; margin-bottom: 25px; }
    .party-row { display: grid; grid-template-columns: 1fr 1fr; }
    .party-row:first-child { border-bottom: 1px solid #d1d5db; }
    .party-left { border-right: 1px solid #d1d5db; padding: 10px 12px; }
    .party-right { padding: 10px 12px; }
    .party-label { font-weight: bold; color: #6b7280; }
    .party-value { font-weight: 600; }

    table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.items th { border-bottom: 2px solid #1f2937; padding: 8px 5px; font-weight: bold; text-align: left; }
    table.items td { border-bottom: 1px solid #d1d5db; padding: 8px 5px; }
    table.items td.right, table.items th.right { text-align: right; }
    table.items td.center, table.items th.center { text-align: center; }

    .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
    .totals-box { width: 220px; }
    .totals-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals-row.final { border-top: 2px solid #1f2937; margin-top: 8px; padding-top: 8px; font-weight: bold; }
    .totals-words { text-align: right; font-size: 10px; color: #6b7280; margin-top: 5px; font-style: italic; }

    .footer { margin-top: 40px; font-family: 'Courier New', monospace; font-size: 11px; color: #4b5563; }
    .footer p { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">JVKPRO<sup style="font-size: 12px; vertical-align: super;">®</sup></div>
    <div class="invoice-title">
      <h1>RĒĶINS Nr. ${invoice.invoice_number}<span class="page">1(1)</span></h1>
      <div class="invoice-dates">
        <table>
          <tr><td>Rēķina datums</td><td>${formatDate(invoice.invoice_date)}</td></tr>
          <tr><td>Apmaksāt līdz</td><td>${invoice.due_date ? formatDate(invoice.due_date) : '-'}</td></tr>
          <tr><td>Apmaksas termiņš</td><td>${paymentTermDays ? paymentTermDays + ' dienu laikā' : '-'}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <div class="parties-box">
    <div class="party-row">
      <div class="party-left">
        <div><span class="party-label">Sūtītājs:</span> <span class="party-value">${company.company_name || 'JVK Pro SIA'}</span></div>
        <div><span class="party-label">Juridiskā adrese</span> ${company.address || 'Piedrujas iela 28'}</div>
        <div style="margin-left: 95px;">${company.city || 'LV-1073, Rīga'}</div>
      </div>
      <div class="party-right">
        <div><span class="party-label">Reģistrācijas numurs</span> ${company.reg_number}</div>
        <div><span class="party-label">PVN numurs</span> ${company.pvn_number}</div>
        <div><span class="party-label">Banka</span> ${company.bank_name}, ${company.bank_swift}</div>
        <div><span class="party-label">Bankas konta numurs</span> ${company.bank_account}</div>
      </div>
    </div>
    <div class="party-row">
      <div class="party-left">
        <div><span class="party-label">Saņēmējs:</span> <span class="party-value">${invoice.client_name}</span></div>
        <div><span class="party-label">Juridiskā adrese</span> ${invoice.client_address || ''}</div>
        <div style="margin-left: 95px;">${invoice.client_country || 'Latvija'}</div>
      </div>
      <div class="party-right">
        <div><span class="party-label">Reģistrācijas numurs</span> ${invoice.client_reg_number || '-'}</div>
        <div><span class="party-label">PVN numurs</span> ${invoice.client_pvn || '-'}</div>
        <div><span class="party-label">Banka</span> ${invoice.client_bank || '-'}</div>
        <div><span class="party-label">Bankas konta numurs</span> ${invoice.client_bank_account || '-'}</div>
      </div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Produkta nr.</th>
        <th>Apraksts</th>
        <th class="right">Cena par vienību €</th>
        <th class="center">Daudzums</th>
        <th class="center">PVN %</th>
        <th class="right">Kopā €</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, idx) => `
        <tr>
          <td>${idx + 1}. ${idx + 1}</td>
          <td>${item.description}</td>
          <td class="right">${formatNumber(parseFloat(item.amount_net) / parseFloat(item.quantity))}</td>
          <td class="center">${parseInt(item.quantity)} gab.</td>
          <td class="center">${item.pvn_rate || 21}</td>
          <td class="right">${formatNumber(item.amount_gross)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row">
        <span>Kopsumma bez PVN €</span>
        <span>${formatNumber(invoice.subtotal)}</span>
      </div>
      <div class="totals-row">
        <span>PVN kopsumma €</span>
        <span>${formatNumber(invoice.pvn_amount)}</span>
      </div>
      <div class="totals-row final">
        <span>Summa apmaksai €</span>
        <span>${formatNumber(invoice.total)}</span>
      </div>
      <div class="totals-words">${formatEurWords(parseFloat(invoice.total))}</div>
    </div>
  </div>

  <div class="footer">
    <p>Rēķins ir sagatavots elektroniski un derīgs bez paraksta.</p>
    <p>Paldies par sadarbību!</p>
  </div>
</body>
</html>
`;
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserInstance;
}

async function generatePDF(invoice, items, company) {
  const html = generateInvoiceHTML(invoice, items, company);
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
  });

  await page.close();
  return pdf;
}

module.exports = { generatePDF };
