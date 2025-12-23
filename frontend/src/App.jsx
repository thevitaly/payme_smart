import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FileText, Printer, Search, X, Check, Trash2, Edit, Eye, ChevronDown, Download, Clock, Bell, CheckCircle, PenSquare, FileCheck, Receipt, CreditCard, Building2, Banknote, Mic, Camera, Type, Mail, Calendar, RefreshCw, Loader2, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3006';

// Number to words converter for Latvian
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

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Format number
function formatNumber(num) {
  return parseFloat(num).toFixed(2).replace('.', ',');
}

// API helper
async function api(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Toast notifications
function Toast({ message, type, onClose }) {
  const colors = {
    error: 'bg-red-900/90 border-red-600',
    success: 'bg-green-900/90 border-green-600',
    info: 'bg-blue-900/90 border-blue-600'
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 ${colors[type]} border rounded-lg p-4 shadow-lg animate-slide-in max-w-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// Format datetime for timeline
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('lv-LV', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Timeline component
function Timeline({ history }) {
  if (!history || history.length === 0) return null;

  const actionIcons = {
    created: <FileCheck size={16} className="text-green-400" />,
    edited: <PenSquare size={16} className="text-blue-400" />,
    paid: <CheckCircle size={16} className="text-emerald-400" />,
    payment_cancelled: <X size={16} className="text-orange-400" />
  };

  const actionLabels = {
    created: 'Izveidots',
    edited: 'Rediģēts',
    paid: 'Apmaksāts',
    payment_cancelled: 'Apmaksa atcelta'
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Clock size={16} /> Vēsture
      </h3>
      <div className="space-y-3">
        {history.map((event, idx) => (
          <div key={event.id || idx} className="flex items-start gap-3">
            <div className="mt-0.5">{actionIcons[event.action] || <Clock size={16} />}</div>
            <div className="flex-1">
              <div className="text-sm font-medium">{actionLabels[event.action] || event.action}</div>
              {event.description && <div className="text-xs text-gray-400">{event.description}</div>}
              {event.amount && <div className="text-xs text-green-400">{formatNumber(event.amount)} EUR</div>}
              <div className="text-xs text-gray-500">{formatDateTime(event.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reminders component
function Reminders({ reminders, invoiceId, onUpdate }) {
  const [localReminders, setLocalReminders] = useState(reminders || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalReminders(reminders || []);
  }, [reminders]);

  const reminderLabels = {
    before_14: '14 dienas pirms termiņa',
    before_7: '7 dienas pirms termiņa',
    after_7: '7 dienas pēc termiņa',
    after_14: '14 dienas pēc termiņa',
    after_30: '30 dienas pēc termiņa',
    after_60: '60 dienas pēc termiņa'
  };

  const handleToggle = async (reminderType, currentValue) => {
    const updated = localReminders.map(r =>
      r.reminder_type === reminderType ? { ...r, is_enabled: currentValue ? 0 : 1 } : r
    );
    setLocalReminders(updated);

    setSaving(true);
    try {
      await api(`/invoices/${invoiceId}/reminders`, {
        method: 'PUT',
        body: JSON.stringify({
          reminders: [{ reminder_type: reminderType, is_enabled: !currentValue }]
        })
      });
      if (onUpdate) onUpdate();
    } catch (err) {
      // Revert on error
      setLocalReminders(reminders || []);
      console.error('Error updating reminder:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!localReminders || localReminders.length === 0) return null;

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Bell size={16} /> Atgādinājumi
      </h3>
      <div className="space-y-2">
        {localReminders.map(reminder => (
          <label
            key={reminder.id || reminder.reminder_type}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-2 rounded"
          >
            <input
              type="checkbox"
              checked={!!reminder.is_enabled}
              onChange={() => handleToggle(reminder.reminder_type, reminder.is_enabled)}
              disabled={saving}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm flex-1">{reminderLabels[reminder.reminder_type] || reminder.reminder_type}</span>
            {reminder.sent_at && (
              <span className="text-xs text-green-400">Nosūtīts</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

// Calculate payment term in days
function getPaymentTermDays(invoiceDate, dueDate) {
  if (!dueDate) return null;
  const start = new Date(invoiceDate);
  const end = new Date(dueDate);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

// Invoice Preview Component (for printing) - matching sample format
function InvoicePreview({ invoice, items, company, onClose, onRefresh }) {
  const handlePrint = () => {
    window.print();
  };

  const paymentTermDays = getPaymentTermDays(invoice.invoice_date, invoice.due_date);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 overflow-auto">
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <a href={`${API_BASE}/api/invoices/${invoice.id}/pdf`} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2">
          <Download size={18} /> PDF
        </a>
        <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2">
          <Printer size={18} /> Drukāt
        </button>
        <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg">
          <X size={18} />
        </button>
      </div>

      {/* Sidebar with Timeline and Reminders */}
      <div className="no-print fixed left-4 top-16 w-72 space-y-4 max-h-[calc(100vh-5rem)] overflow-auto">
        <Timeline history={invoice.history} />
        <Reminders reminders={invoice.reminders} invoiceId={invoice.id} onUpdate={onRefresh} />
      </div>

      {/* Print content - A4 format */}
      <div className="invoice-print-area bg-white text-gray-900 max-w-[210mm] mx-auto my-8 px-12 py-8 shadow-2xl print:shadow-none print:my-0" style={{ minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="text-4xl font-black tracking-tight" style={{ fontFamily: 'Arial Black, sans-serif' }}>
            <span className="text-black">JVKPR</span><span className="text-black">O</span>
            <sup className="text-sm align-top">®</sup>
          </div>

          <div className="text-right">
            <div className="flex items-baseline justify-end gap-4 mb-2">
              <span className="text-2xl font-bold">RĒĶINS Nr. {invoice.invoice_number}</span>
              <span className="text-gray-500">1(1)</span>
            </div>
            <div className="border-t-2 border-gray-300 pt-2 text-sm">
              <table className="ml-auto">
                <tbody>
                  <tr>
                    <td className="pr-4 text-gray-600 font-semibold">Rēķina datums</td>
                    <td>{formatDate(invoice.invoice_date)}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-600 font-semibold">Apmaksāt līdz</td>
                    <td>{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-gray-600 font-semibold">Apmaksas termiņš</td>
                    <td>{paymentTermDays ? `${paymentTermDays} dienu laikā` : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sender & Recipient boxes */}
        <div className="border border-gray-300 mb-6">
          {/* Sender */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="p-3 border-r border-gray-300">
              <div className="text-sm">
                <span className="font-bold text-gray-600">Sūtītājs:</span>
                <span className="ml-2 font-semibold">{company.company_name || 'JVK Pro SIA'}</span>
              </div>
              <div className="text-sm">
                <span className="font-bold text-gray-600">Juridiskā adrese</span>
                <span className="ml-2">{company.address || 'Piedrujas iela 28'}</span>
              </div>
              <div className="text-sm ml-[106px]">{company.city || 'LV-1073, Rīga'}</div>
            </div>
            <div className="p-3 text-sm">
              <div><span className="font-bold text-gray-600">Reģistrācijas numurs</span> <span className="ml-2">{company.reg_number}</span></div>
              <div><span className="font-bold text-gray-600">PVN numurs</span> <span className="ml-2">{company.pvn_number}</span></div>
              <div><span className="font-bold text-gray-600">Banka</span> <span className="ml-2">{company.bank_name}, {company.bank_swift}</span></div>
              <div><span className="font-bold text-gray-600">Bankas konta numurs</span> <span className="ml-2">{company.bank_account}</span></div>
            </div>
          </div>

          {/* Recipient */}
          <div className="grid grid-cols-2">
            <div className="p-3 border-r border-gray-300">
              <div className="text-sm">
                <span className="font-bold text-gray-600">Saņēmējs:</span>
                <span className="ml-2 font-semibold">{invoice.client_name}</span>
              </div>
              <div className="text-sm">
                <span className="font-bold text-gray-600">Juridiskā adrese</span>
                <span className="ml-2">{invoice.client_address || ''}</span>
              </div>
              <div className="text-sm ml-[106px]">{invoice.client_country || 'Latvija'}</div>
            </div>
            <div className="p-3 text-sm">
              <div><span className="font-bold text-gray-600">Reģistrācijas numurs</span> <span className="ml-2">{invoice.client_reg_number || '-'}</span></div>
              <div><span className="font-bold text-gray-600">PVN numurs</span> <span className="ml-2">{invoice.client_pvn || '-'}</span></div>
              <div><span className="font-bold text-gray-600">Banka</span> <span className="ml-2">{invoice.client_bank || '-'}</span></div>
              <div><span className="font-bold text-gray-600">Bankas konta numurs</span> <span className="ml-2">{invoice.client_bank_account || '-'}</span></div>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="py-2 text-left font-bold">Produkta nr.</th>
              <th className="py-2 text-left font-bold">Apraksts</th>
              <th className="py-2 text-right font-bold">Cena par vienību €</th>
              <th className="py-2 text-center font-bold">Daudzums</th>
              <th className="py-2 text-center font-bold">PVN %</th>
              <th className="py-2 text-right font-bold">Kopā €</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id || idx} className="border-b border-gray-300">
                <td className="py-2">{idx + 1}. {item.product_nr || (idx + 1)}</td>
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{formatNumber(item.amount_net / item.quantity)}</td>
                <td className="py-2 text-center">{parseInt(item.quantity)} gab.</td>
                <td className="py-2 text-center">{item.pvn_rate || 21}</td>
                <td className="py-2 text-right">{formatNumber(item.amount_gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-1 text-sm">
              <span>Kopsumma bez PVN €</span>
              <span>{formatNumber(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span>PVN kopsumma €</span>
              <span>{formatNumber(invoice.pvn_amount)}</span>
            </div>
            <div className="border-t-2 border-gray-800 mt-2 pt-2">
              <div className="flex justify-between font-bold">
                <span>Summa apmaksai €</span>
                <span>{formatNumber(invoice.total)}</span>
              </div>
              <div className="text-right text-sm text-gray-600 mt-1">
                {formatEurWords(parseFloat(invoice.total))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-sm text-gray-700" style={{ fontFamily: 'Courier New, monospace' }}>
          <p>Rēķins ir sagatavots elektroniski un derīgs bez paraksta.</p>
          <p className="mt-2">Paldies par sadarbību!</p>
        </div>
      </div>
    </div>
  );
}

// Service Combobox - editable dropdown (fully controlled)
function ServiceCombobox({ value, onChange, onPriceChange, services }) {
  const [isOpen, setIsOpen] = useState(false);

  const filtered = services.filter(s => {
    const serviceName = s.name || s.description || '';
    return serviceName.toLowerCase().includes((value || '').toLowerCase());
  });

  const handleSelect = (service) => {
    const serviceName = service.name || service.description || '';
    console.log('Selected service:', service, 'Name:', serviceName);
    onChange(serviceName);
    if (onPriceChange && service.base_price) {
      onPriceChange(parseFloat(service.base_price));
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder="Izvēlieties vai ievadiet..."
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-auto">
          {filtered.map(service => (
            <div
              key={service.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(service); }}
              className="px-3 py-2 hover:bg-slate-700 cursor-pointer flex justify-between items-center text-sm"
            >
              <span>{service.name || service.description}</span>
              <span className="text-gray-400">{formatNumber(service.base_price)} EUR</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Client selector
function ClientSelector({ value, onChange, clients }) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = clients.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const selected = clients.find(c => c.id === value);

  return (
    <div className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 cursor-pointer flex justify-between items-center"
      >
        <span>{selected ? `${selected.first_name} ${selected.last_name || ''}` : 'Izvēlieties klientu...'}</span>
        <ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-auto">
          <div className="p-2 sticky top-0 bg-slate-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Meklēt..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-gray-400 text-sm">Nav atrasts</div>
          ) : (
            filtered.map(client => (
              <div
                key={client.id}
                onClick={() => { onChange(client.id); setIsOpen(false); setSearch(''); }}
                className="px-4 py-2 hover:bg-slate-700 cursor-pointer flex justify-between items-center"
              >
                <span>{client.first_name} {client.last_name || ''}</span>
                <span className="text-gray-400 text-sm">{client.phone}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Payment term options
const PAYMENT_TERMS = [
  { days: 1, label: '1 diena' },
  { days: 7, label: '7 dienas' },
  { days: 14, label: '14 dienas' },
  { days: 30, label: '30 dienas' },
];

// Create/Edit Invoice Modal
function InvoiceModal({ invoice, clients, company, services, onSave, onClose }) {
  const [clientId, setClientId] = useState(invoice?.client_id || null);
  const [clientName, setClientName] = useState(invoice?.client_name || '');
  const [clientPvn, setClientPvn] = useState(invoice?.client_pvn || '');
  const [clientRegNumber, setClientRegNumber] = useState(invoice?.client_reg_number || '');
  const [clientCountry, setClientCountry] = useState(invoice?.client_country || 'Latvija');
  const [clientAddress, setClientAddress] = useState(invoice?.client_address || '');
  const [clientBank, setClientBank] = useState(invoice?.client_bank || '');
  const [clientBankAccount, setClientBankAccount] = useState(invoice?.client_bank_account || '');
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(invoice?.due_date?.split('T')[0] || '');
  const [paymentTerm, setPaymentTerm] = useState(14); // default 14 days
  const [paymentMethod, setPaymentMethod] = useState(invoice?.payment_method || 'Pārskaitījums');
  const [items, setItems] = useState(invoice?.items || [{ description: '', quantity: 1, unit: 'gabals(-i)', unit_price: '' }]);
  const [saving, setSaving] = useState(false);

  // Calculate due date when invoice date or payment term changes
  useEffect(() => {
    if (invoiceDate && paymentTerm) {
      const date = new Date(invoiceDate);
      date.setDate(date.getDate() + paymentTerm);
      setDueDate(date.toISOString().split('T')[0]);
    }
  }, [invoiceDate, paymentTerm]);

  // Update client info when selecting
  useEffect(() => {
    if (clientId && !invoice) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        // Use company_name if available, otherwise first_name + last_name
        const name = client.company_name || `${client.first_name} ${client.last_name || ''}`.trim();
        setClientName(name);
        setClientPvn(client.pvn_number || client.vat_number || '');
        setClientRegNumber(client.registration_number || '');
        setClientCountry(client.country || 'Latvija');
        setClientAddress(client.legal_address || '');
        // Bank info
        const bankInfo = client.bank_name ? `${client.bank_name}${client.swift_bic ? ', ' + client.swift_bic : ''}` : '';
        setClientBank(bankInfo);
        setClientBankAccount(client.bank_account || '');
      }
    }
  }, [clientId, clients, invoice]);

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit: 'gabals(-i)', unit_price: '' }]);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const calculateTotal = () => {
    // Price entered is already WITH PVN included
    return items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!clientId) {
      alert('Lūdzu izvēlieties klientu!');
      return;
    }

    // Validate items - check description and price
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const desc = (item.description || '').trim();
      const price = parseFloat(item.unit_price);

      if (!desc) {
        alert(`Pozīcija ${i + 1}: lūdzu ievadiet nosaukumu!`);
        return;
      }
      if (isNaN(price) || price <= 0) {
        alert(`Pozīcija ${i + 1}: lūdzu ievadiet derīgu cenu!`);
        return;
      }
    }

    setSaving(true);
    try {
      const data = {
        client_id: clientId,
        client_name: clientName,
        client_reg_number: clientRegNumber,
        client_pvn: clientPvn,
        client_country: clientCountry,
        client_address: clientAddress,
        client_bank: clientBank,
        client_bank_account: clientBankAccount,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        payment_method: paymentMethod,
        items: items.map(i => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit,
          unit_price: parseFloat(i.unit_price) || 0
        }))
      };

      if (invoice) {
        await api(`/invoices/${invoice.id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await api('/invoices', { method: 'POST', body: JSON.stringify(data) });
      }
      onSave();
    } catch (err) {
      alert('Kļūda: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-slate-800 px-6 py-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold">{invoice ? 'Rediģēt rēķinu' : 'Jauns rēķins'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Client selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Klients *</label>
              <ClientSelector value={clientId} onChange={setClientId} clients={clients.filter(c => c.is_company)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Rēķina datums *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
                required
              />
            </div>
          </div>

          {/* Client details - Row 1 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Saņēmējs</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Reģistrācijas numurs</label>
              <input
                type="text"
                value={clientRegNumber}
                onChange={(e) => setClientRegNumber(e.target.value)}
                placeholder="40000000000"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">PVN numurs</label>
              <input
                type="text"
                value={clientPvn}
                onChange={(e) => setClientPvn(e.target.value)}
                placeholder="LV40000000000"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
          </div>

          {/* Client details - Row 2 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Juridiskā adrese</label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Adrese..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Valsts</label>
              <input
                type="text"
                value={clientCountry}
                onChange={(e) => setClientCountry(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Banka</label>
              <input
                type="text"
                value={clientBank}
                onChange={(e) => setClientBank(e.target.value)}
                placeholder="Banka, SWIFT"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
          </div>

          {/* Client details - Row 3 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-2">Bankas konts</label>
              <input
                type="text"
                value={clientBankAccount}
                onChange={(e) => setClientBankAccount(e.target.value)}
                placeholder="LV00XXXX0000000000000"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
          </div>

          {/* Payment term */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Apmaksas termiņš</label>
              <div className="flex gap-2">
                {PAYMENT_TERMS.map(term => (
                  <button
                    key={term.days}
                    type="button"
                    onClick={() => setPaymentTerm(term.days)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      paymentTerm === term.days
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-700 border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {term.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Apmaksāt līdz</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-3">
              <label className="text-sm font-medium">Pozīcijas *</label>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Nosaukums</label>}
                    <ServiceCombobox
                      value={item.description}
                      onChange={(val) => updateItem(idx, 'description', val)}
                      onPriceChange={(price) => updateItem(idx, 'unit_price', price)}
                      services={services}
                    />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Daudzums</label>}
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Mērvienība</label>}
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
                    >
                      <option value="gabals(-i)">gabals(-i)</option>
                      <option value="stunda(-s)">stunda(-s)</option>
                      <option value="diena(-s)">diena(-s)</option>
                      <option value="komplekts">komplekts</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Cena EUR</label>}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-2">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={addItem} className="mt-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm flex items-center gap-2">
              <Plus size={16} /> Pievienot pozīciju
            </button>
          </div>

          {/* Total */}
          <div className="bg-slate-700/50 rounded-lg p-4 text-right">
            <span className="text-gray-400">Kopā (PVN iekļauts):</span>
            <span className="text-2xl font-bold ml-3">{formatNumber(calculateTotal())} EUR</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button type="button" onClick={onClose} className="px-6 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg">
              Atcelt
            </button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
              {saving ? 'Saglabā...' : <><Check size={18} /> Saglabāt</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// File Preview Modal
function FilePreviewModal({ bill, onClose }) {
  // file_url now contains the direct Dropbox URL
  const fileUrl = bill.file_url || null;
  const isImage = bill.input_type === 'PHOTO';
  const isAudio = bill.input_type === 'VOICE';
  const isText = bill.input_type === 'TEXT';
  const isPdf = bill.file_path?.endsWith('.pdf') || bill.file_url?.includes('.pdf');
  const isCompact = isText || isAudio;

  // Convert Dropbox URL to direct download URL for preview
  const getDirectUrl = (url) => {
    if (!url) return null;
    if (url.includes('dropbox.com')) {
      return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
    }
    return url;
  };

  const directUrl = getDirectUrl(fileUrl);

  // Compact modal for TEXT and VOICE
  if (isCompact) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-700/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {isText ? (
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Type size={16} className="text-blue-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Mic size={16} className="text-purple-400" />
                    </div>
                  )}
                  <span className="text-lg font-semibold text-red-400">{formatNumber(bill.amount)} {bill.currency}</span>
                </div>
                <div className="text-xs text-gray-500">{formatDate(bill.created_at)}</div>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-gray-200 leading-relaxed">
                {isText ? (bill.original_text || 'Nav teksta') : (bill.transcription || 'Nav transkripcijas')}
              </p>
            </div>
          </div>

          {/* Footer with badges */}
          <div className="px-5 py-3 bg-slate-900/30 border-t border-slate-700/30">
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                {bill.category_name}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                {bill.subcategory_name}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${bill.payment_type === 'CASH' ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/20 text-orange-300'}`}>
                {bill.payment_type === 'CASH' ? 'Skaidra' : 'Banka'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Large modal for PDF, PHOTO, DOCUMENT
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-slate-800 rounded-xl shadow-2xl w-[95vw] max-w-6xl h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 bg-slate-800 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-bold">{bill.description || 'Fails'}</h2>
              <div className="text-sm text-gray-400">{formatDate(bill.created_at)} - {formatNumber(bill.amount)} {bill.currency}</div>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-600/30 text-blue-300 border border-blue-500/50">
                {bill.category_name}
              </span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-600/30 text-purple-300 border border-purple-500/50">
                {bill.subcategory_name}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${bill.payment_type === 'CASH' ? 'bg-green-600/30 text-green-300 border border-green-500/50' : 'bg-orange-600/30 text-orange-300 border border-orange-500/50'}`}>
                {bill.payment_type === 'CASH' ? 'Skaidra' : 'Banka'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm"
              >
                <Download size={14} /> Lejupielādēt
              </a>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 hover:bg-slate-700 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-auto">
          {!fileUrl ? (
            <div className="text-center text-gray-400 py-12">
              <FileText size={48} className="mx-auto mb-3 opacity-50" />
              <div>Fails nav pieejams</div>
            </div>
          ) : isImage ? (
            <img src={directUrl} alt={bill.description} className="max-w-full h-auto rounded-lg mx-auto" />
          ) : isPdf ? (
            <iframe
              src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(directUrl)}`}
              className="w-full h-full rounded-lg border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto mb-3 text-orange-400" />
              <div className="mb-4">Dokuments</div>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg inline-flex items-center gap-2"
              >
                <Download size={18} /> Atvērt failu
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Email Import Modal Component
function EmailImportModal({ onClose, showToast, categories, onImportComplete }) {
  const [step, setStep] = useState('connect'); // connect, dates, emails, processing, review
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: null });
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [emails, setEmails] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [processedInvoices, setProcessedInvoices] = useState([]);
  const [processingIndex, setProcessingIndex] = useState(-1);
  const [previewInvoice, setPreviewInvoice] = useState(null);

  useEffect(() => {
    checkGmailStatus();

    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected') === 'true') {
      showToast('Gmail savienots veiksmīgi!', 'success');
      window.history.replaceState({}, '', window.location.pathname);
      checkGmailStatus();
    }
    if (params.get('gmail_error')) {
      showToast('Gmail kļūda: ' + params.get('gmail_error'), 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkGmailStatus = async () => {
    try {
      const status = await api('/gmail/status');
      setGmailStatus(status);
      if (status.connected) {
        setStep('dates');
      }
    } catch (err) {
      console.error('Gmail status error:', err);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const { authUrl } = await api('/gmail/auth-url');
      window.location.href = authUrl;
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api('/gmail/disconnect', { method: 'POST' });
      setGmailStatus({ connected: false, email: null });
      setStep('connect');
      showToast('Gmail atvienots', 'success');
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const handleFetchEmails = async () => {
    setLoading(true);
    try {
      const result = await api('/gmail/fetch-emails', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, maxResults: 50 })
      });
      setEmails(result.emails || []);
      setStep('emails');
      if (result.emails?.length === 0) {
        showToast('Nav atrasti e-pasti ar pielikumiem', 'info');
      }
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleEmailSelection = (emailId) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(emailId)) {
      newSelected.delete(emailId);
    } else {
      newSelected.add(emailId);
    }
    setSelectedEmails(newSelected);
  };

  const handleProcessSelected = async () => {
    const selectedEmailsList = emails.filter(e => selectedEmails.has(e.id));
    const allItems = []; // Both attachments and text-only emails

    selectedEmailsList.forEach(email => {
      if (email.attachments.length > 0) {
        // Emails with attachments
        email.attachments.forEach(att => {
          allItems.push({
            type: 'attachment',
            ...att,
            emailId: email.id,
            emailSubject: email.subject,
            emailFrom: email.from,
            emailDate: email.date
          });
        });
      } else if (email.bodyText) {
        // Emails without attachments (text only)
        allItems.push({
          type: 'emailText',
          filename: `Email: ${email.subject.substring(0, 40)}...`,
          emailId: email.id,
          emailSubject: email.subject,
          emailFrom: email.from,
          emailDate: email.date,
          bodyText: email.bodyText
        });
      }
    });

    if (allItems.length === 0) {
      showToast('Nav izvēlēti pielikumi vai teksta e-pasti', 'error');
      return;
    }

    setStep('processing');
    setProcessingIndex(0);
    const results = [];

    for (let i = 0; i < allItems.length; i++) {
      setProcessingIndex(i);
      const item = allItems[i];

      try {
        let result;

        if (item.type === 'attachment') {
          // Process attachment
          result = await api('/gmail/process-attachment', {
            method: 'POST',
            body: JSON.stringify({
              messageId: item.emailId,
              attachment: {
                filename: item.filename,
                mimeType: item.mimeType,
                attachmentId: item.attachmentId
              }
            })
          });
        } else {
          // Process email text
          result = await api('/gmail/process-email-text', {
            method: 'POST',
            body: JSON.stringify({
              messageId: item.emailId,
              subject: item.emailSubject,
              from: item.emailFrom,
              bodyText: item.bodyText
            })
          });
        }

        // Ensure extraction.data always exists, use email date as fallback
        const extractionData = result.extraction?.data || {};
        const emailDateFormatted = item.emailDate ? item.emailDate.split('T')[0] : null;
        if (!extractionData.date && emailDateFormatted) {
          extractionData.date = emailDateFormatted;
        }

        results.push({
          ...item,
          dropboxUrl: result.dropboxUrl || null,
          emailText: result.emailText || item.bodyText?.substring(0, 500),
          extraction: { data: extractionData },
          categoryId: 2,      // HQ Local - default
          subcategoryId: 5,   // Ежемесячные платежи
          status: 'pending'
        });
      } catch (err) {
        console.error('Process error:', err);
        // Still provide empty form with email date
        const emailDateFormatted = item.emailDate ? item.emailDate.split('T')[0] : null;
        results.push({
          ...item,
          emailText: item.bodyText?.substring(0, 500),
          extraction: { data: { date: emailDateFormatted } },
          categoryId: 2,      // HQ Local - default
          subcategoryId: 5,   // Ежемесячные платежи
          status: 'pending'   // Allow manual entry even on error
        });
      }
    }

    setProcessedInvoices(results);
    setStep('review');
  };

  const handleAcceptInvoice = async (index) => {
    const invoice = processedInvoices[index];
    try {
      await api('/gmail/accept-invoice', {
        method: 'POST',
        body: JSON.stringify({
          emailId: invoice.emailId,
          emailSubject: invoice.emailSubject,
          emailFrom: invoice.emailFrom,
          emailDate: invoice.emailDate,
          attachmentFilename: invoice.filename,
          dropboxUrl: invoice.dropboxUrl,
          emailText: invoice.emailText,
          extractedData: invoice.extraction?.data || {},
          categoryId: invoice.categoryId,
          subcategoryId: invoice.subcategoryId
        })
      });

      const updated = [...processedInvoices];
      updated[index].status = 'accepted';
      setProcessedInvoices(updated);
      showToast('Rēķins pieņemts un pievienots izdevumiem', 'success');
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const handleRejectInvoice = async (index) => {
    const invoice = processedInvoices[index];
    try {
      await api('/gmail/reject-invoice', {
        method: 'POST',
        body: JSON.stringify({
          emailId: invoice.emailId,
          emailSubject: invoice.emailSubject,
          emailFrom: invoice.emailFrom,
          emailDate: invoice.emailDate,
          attachmentFilename: invoice.filename,
          dropboxUrl: invoice.dropboxUrl,
          extractedData: invoice.extraction?.data || {}
        })
      });

      const updated = [...processedInvoices];
      updated[index].status = 'rejected';
      setProcessedInvoices(updated);
      showToast('Rēķins noraidīts', 'info');
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const updateInvoiceField = (index, field, value) => {
    const updated = [...processedInvoices];
    if (field.startsWith('extraction.')) {
      const dataField = field.replace('extraction.data.', '');
      if (!updated[index].extraction) updated[index].extraction = { data: {} };
      if (!updated[index].extraction.data) updated[index].extraction.data = {};
      updated[index].extraction.data[dataField] = value;
    } else {
      updated[index][field] = value;
    }
    setProcessedInvoices(updated);
  };

  const pendingCount = processedInvoices.filter(i => i.status === 'pending').length;
  const acceptedCount = processedInvoices.filter(i => i.status === 'accepted').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Mail className="text-blue-400" size={24} />
            <h2 className="text-xl font-bold">Importēt no Email</h2>
            {gmailStatus.connected && (
              <span className="text-sm text-gray-400">({gmailStatus.email})</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {/* Step: Connect Gmail */}
          {step === 'connect' && (
            <div className="text-center py-12">
              <Mail size={64} className="mx-auto mb-6 text-gray-500" />
              <h3 className="text-xl font-medium mb-2">Savienot Gmail kontu</h3>
              <p className="text-gray-400 mb-6">
                Savienojiet savu Gmail kontu, lai importētu rēķinus no e-pasta pielikumiem
              </p>
              <button
                onClick={handleConnectGmail}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg inline-flex items-center gap-2"
              >
                <Mail size={18} /> Savienot Gmail
              </button>
            </div>
          )}

          {/* Step: Select Dates */}
          {step === 'dates' && (
            <div className="max-w-md mx-auto py-8">
              <h3 className="text-lg font-medium mb-6 text-center">Izvēlieties datumu diapazonu</h3>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">No datuma</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Līdz datumam</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"
                  />
                </div>
              </div>

              <button
                onClick={handleFetchEmails}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-3 rounded-lg inline-flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Meklē e-pastus...
                  </>
                ) : (
                  <>
                    <Search size={18} /> Meklēt e-pastus ar pielikumiem
                  </>
                )}
              </button>

              <div className="mt-6 text-center">
                <button
                  onClick={handleDisconnect}
                  className="text-sm text-gray-400 hover:text-red-400"
                >
                  Atvienot Gmail
                </button>
              </div>
            </div>
          )}

          {/* Step: Select Emails */}
          {step === 'emails' && (
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="text-lg font-medium">
                  Atrasti {emails.length} e-pasti ar pielikumiem
                </h3>
                <button
                  onClick={() => setStep('dates')}
                  className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <Calendar size={14} /> Mainīt datumus
                </button>
              </div>

              {emails.length === 0 ? (
                <div className="text-center py-12 text-gray-400 flex-1">
                  <Mail size={48} className="mx-auto mb-3 opacity-50" />
                  <div>Nav atrasti e-pasti ar pielikumiem vai rēķinu informāciju</div>
                </div>
              ) : (
                <div className="space-y-2 flex-1 overflow-auto min-h-0">
                  {emails.map(email => (
                    <div
                      key={email.id}
                      onClick={() => toggleEmailSelection(email.id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedEmails.has(email.id)
                          ? 'bg-blue-900/30 border-blue-600'
                          : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-1 ${
                          selectedEmails.has(email.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-500'
                        }`}>
                          {selectedEmails.has(email.id) && <Check size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{email.subject}</div>
                          <div className="text-sm text-gray-400 truncate">{email.from}</div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>{formatDate(email.date)}</span>
                            {email.attachments.length > 0 ? (
                              <span className="flex items-center gap-1">
                                <FileText size={12} />
                                {email.attachments.length} pielikum{email.attachments.length === 1 ? 's' : 'i'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Mail size={12} />
                                Teksts
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {email.attachments.length > 0 ? (
                              email.attachments.map((att, i) => (
                                <span key={i} className="text-xs bg-slate-600 px-2 py-0.5 rounded">
                                  {att.filename}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs bg-amber-700/50 text-amber-300 px-2 py-0.5 rounded">
                                E-pasta teksts tiks analizēts
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {emails.length > 0 && (
                <div className="pt-4 flex justify-between items-center shrink-0 border-t border-slate-700 mt-4">
                  <span className="text-sm text-gray-400">
                    Izvēlēti: {selectedEmails.size} e-pasti
                  </span>
                  <button
                    onClick={handleProcessSelected}
                    disabled={selectedEmails.size === 0}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded-lg inline-flex items-center gap-2"
                  >
                    Apstrādāt izvēlētos
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Processing */}
          {step === 'processing' && (
            <div className="text-center py-12">
              <Loader2 size={48} className="mx-auto mb-6 text-blue-400 animate-spin" />
              <h3 className="text-xl font-medium mb-2">Apstrādā e-pastus...</h3>
              <p className="text-gray-400">
                {processingIndex + 1} no {emails.filter(e => selectedEmails.has(e.id))
                  .reduce((sum, e) => Math.max(e.attachments.length, 1), 0)} ierakstiem
              </p>
              <div className="mt-4 text-sm text-gray-500">
                GPT-4 analizē saturu...
              </div>
            </div>
          )}

          {/* Step: Review */}
          {step === 'review' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Pārskatīt importētos rēķinus</h3>
                <div className="text-sm text-gray-400">
                  Gaida: {pendingCount} | Pieņemti: {acceptedCount}
                </div>
              </div>

              <div className="space-y-4">
                {processedInvoices.map((invoice, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      invoice.status === 'accepted' ? 'bg-green-900/20 border-green-700' :
                      invoice.status === 'rejected' ? 'bg-red-900/20 border-red-700 opacity-50' :
                      invoice.error ? 'bg-red-900/20 border-red-700' :
                      'bg-slate-700/50 border-slate-600'
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Preview */}
                      <div
                        className="w-32 h-40 bg-slate-800 rounded overflow-hidden shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                        onClick={() => (invoice.dropboxUrl || invoice.emailText) && setPreviewInvoice(invoice)}
                      >
                        {invoice.dropboxUrl ? (
                          invoice.mimeType?.includes('pdf') ? (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 hover:text-blue-400">
                              <FileText size={32} />
                            </div>
                          ) : (
                            <img
                              src={invoice.dropboxUrl}
                              alt={invoice.filename}
                              className="w-full h-full object-cover"
                            />
                          )
                        ) : invoice.emailText ? (
                          <div className="w-full h-full flex flex-col items-center justify-center text-amber-400 hover:text-amber-300 p-2">
                            <Mail size={28} />
                            <span className="text-xs mt-1 text-center">E-pasta teksts</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Data */}
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-medium">{invoice.filename}</div>
                            <div className="text-sm text-gray-400">{invoice.emailSubject}</div>
                          </div>
                          {invoice.status !== 'pending' && (
                            <span className={`px-2 py-1 rounded text-xs ${
                              invoice.status === 'accepted' ? 'bg-green-600' : 'bg-red-600'
                            }`}>
                              {invoice.status === 'accepted' ? 'Pieņemts' : 'Noraidīts'}
                            </span>
                          )}
                        </div>

                        {/* Always show form - fields are optional for manual entry */}
                        <div className="grid grid-cols-4 gap-3 text-sm">
                          <div>
                            <label className="text-gray-500 text-xs">Sūtītājs</label>
                            <input
                              type="text"
                              value={invoice.extraction?.data?.sender || ''}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.sender', e.target.value)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-xs">Summa</label>
                            <input
                              type="number"
                              step="0.01"
                              value={invoice.extraction?.data?.amount || ''}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.amount', parseFloat(e.target.value))}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-xs">Valūta</label>
                            <input
                              type="text"
                              value={invoice.extraction?.data?.currency || 'EUR'}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.currency', e.target.value)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-xs">Rēķina Nr.</label>
                            <input
                              type="text"
                              value={invoice.extraction?.data?.invoiceNumber || ''}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.invoiceNumber', e.target.value)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-gray-500 text-xs">Apraksts</label>
                            <input
                              type="text"
                              value={invoice.extraction?.data?.description || ''}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.description', e.target.value)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-xs">Datums</label>
                            <input
                              type="date"
                              value={invoice.extraction?.data?.date || ''}
                              onChange={(e) => updateInvoiceField(index, 'extraction.data.date', e.target.value)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-gray-500 text-xs">Kategorija</label>
                            <select
                              value={invoice.categoryId || ''}
                              onChange={(e) => updateInvoiceField(index, 'categoryId', e.target.value ? parseInt(e.target.value) : null)}
                              disabled={invoice.status !== 'pending'}
                              className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm disabled:opacity-50"
                            >
                              <option value="">-- Izvēlēties --</option>
                              {categories?.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Actions */}
                        {invoice.status === 'pending' && (
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => handleAcceptInvoice(index)}
                              className="bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded text-sm inline-flex items-center gap-1"
                            >
                              <CheckCircle2 size={14} /> Pieņemt
                            </button>
                            <button
                              onClick={() => handleRejectInvoice(index)}
                              className="bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded text-sm inline-flex items-center gap-1"
                            >
                              <XCircle size={14} /> Noraidīt
                            </button>
                            {invoice.dropboxUrl && (
                              <button
                                onClick={() => setPreviewInvoice(invoice)}
                                className="bg-slate-600 hover:bg-slate-500 px-4 py-1.5 rounded text-sm inline-flex items-center gap-1"
                              >
                                <Eye size={14} /> Priekšskatīt
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pendingCount === 0 && processedInvoices.length > 0 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => {
                      onImportComplete?.();
                      onClose();
                    }}
                    className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-lg"
                  >
                    Pabeigt importu
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewInvoice && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewInvoice(null)}
        >
          <div
            className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg">{previewInvoice.filename}</h3>
                <div className="text-sm text-gray-400">{previewInvoice.emailSubject}</div>
              </div>
              <div className="flex items-center gap-2">
                {previewInvoice.dropboxUrl && (
                  <a
                    href={previewInvoice.dropboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded text-sm inline-flex items-center gap-1"
                  >
                    <ExternalLink size={14} /> Atvērt jaunā logā
                  </a>
                )}
                <button onClick={() => setPreviewInvoice(null)} className="text-gray-400 hover:text-white p-1">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-900 min-h-[60vh]">
              {previewInvoice.emailText && !previewInvoice.dropboxUrl ? (
                <div className="bg-slate-800 rounded-lg p-6 max-w-3xl mx-auto">
                  <div className="flex items-center gap-2 text-amber-400 mb-4">
                    <Mail size={20} />
                    <span className="font-medium">E-pasta saturs</span>
                  </div>
                  <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {previewInvoice.emailText}
                  </pre>
                </div>
              ) : previewInvoice.mimeType?.includes('pdf') || previewInvoice.filename?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(previewInvoice.dropboxUrl?.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '?raw=1'))}`}
                  className="w-full h-full min-h-[60vh]"
                  title={previewInvoice.filename}
                />
              ) : (
                <img
                  src={previewInvoice.dropboxUrl?.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '?raw=1')}
                  alt={previewInvoice.filename}
                  className="max-w-full max-h-full mx-auto object-contain"
                />
              )}
            </div>

            {/* Extracted Data Summary */}
            {previewInvoice.extraction?.data && (
              <div className="px-6 py-4 border-t border-slate-700 bg-slate-800">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 text-xs">Piegādātājs</div>
                    <div className="font-medium">{previewInvoice.extraction.data.sender || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Summa</div>
                    <div className="font-medium text-green-400">
                      {previewInvoice.extraction.data.amount
                        ? `${previewInvoice.extraction.data.amount.toFixed(2)} ${previewInvoice.extraction.data.currency || 'EUR'}`
                        : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Rēķina Nr.</div>
                    <div className="font-medium">{previewInvoice.extraction.data.invoiceNumber || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Datums</div>
                    <div className="font-medium">{previewInvoice.extraction.data.date || '-'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Bills View Component
function BillsView({ showToast }) {
  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [previewBill, setPreviewBill] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showEmailImport, setShowEmailImport] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      const [billsRes, summaryRes, categoriesRes] = await Promise.all([
        api('/bills'),
        api('/bills/summary'),
        api('/bills/categories').catch(() => [])
      ]);
      setBills(billsRes || []);
      setSummary(summaryRes || null);
      setCategories(categoriesRes || []);
    } catch (err) {
      showToast('Kļūda ielādējot izdevumus: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBill = async (id) => {
    try {
      await api(`/bills/${id}`, { method: 'DELETE' });
      showToast('Izdevums dzēsts', 'success');
      setDeleteConfirm(null);
      fetchBills();
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const filteredBills = categoryFilter
    ? bills.filter(b => b.category_code === categoryFilter)
    : bills;

  const inputTypeIcons = {
    TEXT: <Type size={14} className="text-blue-400" />,
    VOICE: <Mic size={14} className="text-purple-400" />,
    PHOTO: <Camera size={14} className="text-green-400" />,
    DOCUMENT: <FileText size={14} className="text-orange-400" />
  };

  const paymentTypeColors = {
    CASH: 'bg-green-600',
    BANK: 'bg-blue-600'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-xl">Ielādē izdevumus...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Kopā izdevumu</div>
            <div className="text-2xl font-bold">{summary.overall?.total_count || 0}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Kopējā summa</div>
            <div className="text-2xl font-bold text-red-400">
              {formatNumber(summary.overall?.total_amount || 0)} EUR
            </div>
          </div>
          {summary.byCategory?.slice(0, 3).map(cat => (
            <div key={cat.category_code} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="text-gray-400 text-sm">{cat.category}</div>
              <div className="text-xl font-bold">{formatNumber(cat.total || 0)} EUR</div>
              <div className="text-xs text-gray-500">{cat.count} ieraksti</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-4 mb-6 justify-between">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2"
        >
          <option value="">Visas kategorijas</option>
          {summary?.byCategory?.map(cat => (
            <option key={cat.category_code} value={cat.category_code}>
              {cat.category} ({cat.count})
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowEmailImport(true)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg inline-flex items-center gap-2"
        >
          <Mail size={18} /> Importēt no Email
        </button>
      </div>

      {/* Bills table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Datums</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Kategorija</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Apakškategorija</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Apraksts</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-gray-300">Fails</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-gray-300">Maksājums</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Summa</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-gray-300 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                  <Receipt size={48} className="mx-auto mb-3 opacity-50" />
                  <div>Nav izdevumu</div>
                </td>
              </tr>
            ) : (
              filteredBills.map(bill => (
                <tr key={bill.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-gray-400">{formatDate(bill.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium">{bill.category_name || '-'}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{bill.subcategory_name || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs">
                      {bill.description || bill.original_text || bill.transcription || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setPreviewBill(bill)}
                      className="p-2 hover:bg-slate-600 rounded-lg transition-colors cursor-pointer"
                      title="Skatīt"
                    >
                      {inputTypeIcons[bill.input_type] || <FileText size={14} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${paymentTypeColors[bill.payment_type] || 'bg-gray-600'}`}>
                      {bill.payment_type === 'CASH' ? 'Skaidra' : bill.payment_type === 'BANK' ? 'Banka' : bill.payment_type || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium text-red-400">{formatNumber(bill.amount)} {bill.currency}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setDeleteConfirm(bill)}
                      className="p-2 hover:bg-red-600 rounded-lg transition-colors text-red-400 hover:text-white"
                      title="Dzēst"
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* File Preview Modal */}
      {previewBill && (
        <FilePreviewModal bill={previewBill} onClose={() => setPreviewBill(null)} />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-700">
              <h2 className="text-lg font-bold text-red-400">Dzēst izdevumu?</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-300 mb-4">
                Vai tiešām vēlaties dzēst šo izdevumu?
              </p>
              <div className="bg-slate-700 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-400">{formatDate(deleteConfirm.created_at)}</div>
                <div className="font-medium">{deleteConfirm.description || deleteConfirm.original_text || 'Nav apraksta'}</div>
                <div className="text-red-400 font-bold mt-1">{formatNumber(deleteConfirm.amount)} {deleteConfirm.currency}</div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
                >
                  Atcelt
                </button>
                <button
                  onClick={() => handleDeleteBill(deleteConfirm.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2"
                >
                  <Trash2 size={16} /> Dzēst
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Import Modal */}
      {showEmailImport && (
        <EmailImportModal
          onClose={() => setShowEmailImport(false)}
          showToast={showToast}
          categories={categories}
          onImportComplete={fetchBills}
        />
      )}
    </div>
  );
}

// Sidebar Component
function Sidebar({ activeView, setActiveView }) {
  const menuItems = [
    { id: 'invoices', label: 'Rēķini', icon: FileText, sublabel: 'Invoices' },
    { id: 'bills', label: 'Izdevumi', icon: Receipt, sublabel: 'Bills' },
  ];

  return (
    <div className="w-56 bg-slate-800 border-r border-slate-700 min-h-screen">
      <div className="p-4">
        <div className="text-2xl font-bold mb-1">
          <span className="text-white">JVK</span>
          <span className="text-orange-500">PRO</span>
        </div>
        <div className="text-gray-400 text-sm">Payme Pro</div>
      </div>

      <nav className="mt-4">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              activeView === item.id
                ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-500'
                : 'text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            <item.icon size={20} />
            <div>
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-gray-500">{item.sublabel}</div>
            </div>
          </button>
        ))}
      </nav>
    </div>
  );
}

// Main App
function App() {
  const [activeView, setActiveView] = useState('invoices');
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [previewInvoice, setPreviewInvoice] = useState(null);

  const showToast = (message, type = 'info') => setToast({ message, type });

  const fetchData = useCallback(async () => {
    try {
      const [invoicesRes, clientsRes, servicesRes, settingsRes] = await Promise.all([
        api('/invoices'),
        api('/clients?limit=500'),
        api('/services'),
        api('/invoices/settings')
      ]);
      setInvoices(invoicesRes.invoices || []);
      setClients(clientsRes || []);
      setServices(servicesRes || []);
      setCompany(settingsRes || {});
    } catch (err) {
      showToast('Kļūda ielādējot datus: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    if (!confirm('Vai tiešām dzēst šo rēķinu?')) return;
    try {
      await api(`/invoices/${id}`, { method: 'DELETE' });
      showToast('Rēķins dzēsts', 'success');
      fetchData();
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const handleMarkPaid = async (id) => {
    try {
      await api(`/invoices/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({}) });
      showToast('Rēķins atzīmēts kā apmaksāts', 'success');
      fetchData();
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const handleUnmarkPaid = async (id) => {
    if (!confirm('Vai tiešām atcelt apmaksu?')) return;
    try {
      await api(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'draft', payment_date: null }) });
      showToast('Apmaksa atcelta', 'success');
      fetchData();
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const openPreview = async (invoice) => {
    try {
      const data = await api(`/invoices/${invoice.id}`);
      setPreviewInvoice(data);
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const openEdit = async (invoice) => {
    try {
      const data = await api(`/invoices/${invoice.id}`);
      setEditingInvoice(data);
    } catch (err) {
      showToast('Kļūda: ' + err.message, 'error');
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      return inv.invoice_number?.toLowerCase().includes(term) ||
             inv.client_name?.toLowerCase().includes(term);
    }
    return true;
  });

  const statusColors = {
    draft: 'bg-gray-600',
    sent: 'bg-blue-600',
    paid: 'bg-green-600',
    overdue: 'bg-red-600',
    cancelled: 'bg-gray-500'
  };

  const statusLabels = {
    draft: 'Melnraksts',
    sent: 'Nosūtīts',
    paid: 'Apmaksāts',
    overdue: 'Nokavēts',
    cancelled: 'Atcelts'
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Ielādē...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-slate-800 border-b border-slate-700">
          <div className="px-6 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold">
              {activeView === 'invoices' ? 'Rēķini' : 'Izdevumi'}
            </h1>
            {activeView === 'invoices' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 font-medium"
              >
                <Plus size={18} /> Jauns rēķins
              </button>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 px-6 py-6 overflow-auto">
          {activeView === 'bills' ? (
            <BillsView showToast={showToast} />
          ) : (
            <>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Meklēt pēc numura vai klienta..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2"
          >
            <option value="">Visi statusi</option>
            <option value="draft">Melnraksts</option>
            <option value="sent">Nosūtīts</option>
            <option value="paid">Apmaksāts</option>
            <option value="overdue">Nokavēts</option>
            <option value="cancelled">Atcelts</option>
          </select>
        </div>

        {/* Invoices table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Nr.</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Klients</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Datums</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Summa</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-300">Statuss</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Darbības</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                    <FileText size={48} className="mx-auto mb-3 opacity-50" />
                    <div>Nav rēķinu</div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                    <td className="px-4 py-3">{invoice.client_name || `${invoice.first_name || ''} ${invoice.last_name || ''}`}</td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(invoice.invoice_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium">{formatNumber(invoice.total)} EUR</div>
                      <div className="text-xs text-gray-500 italic">{formatEurWords(parseFloat(invoice.total))}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {invoice.status === 'paid' ? (
                        <div className="inline-flex flex-col items-center group relative">
                          <button
                            onClick={() => handleUnmarkPaid(invoice.id)}
                            className="px-2 py-1 rounded text-xs font-medium bg-green-600 hover:bg-yellow-600 transition-colors"
                            title="Noklikšķini lai atceltu apmaksu"
                          >
                            {statusLabels[invoice.status]}
                          </button>
                          {invoice.payment_date && (
                            <span className="text-xs text-gray-500 mt-1">{formatDate(invoice.payment_date)}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleMarkPaid(invoice.id)}
                          className="px-3 py-1 rounded text-xs font-medium bg-yellow-600 hover:bg-green-600 transition-colors flex items-center gap-1 mx-auto"
                          title="Atzīmēt kā apmaksātu"
                        >
                          <Check size={12} /> Atzīmēt apmaksātu
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openPreview(invoice)} className="p-2 hover:bg-slate-600 rounded" title="Skatīt">
                          <Eye size={16} />
                        </button>
                        <a href={`${API_BASE}/api/invoices/${invoice.id}/pdf`} className="p-2 hover:bg-slate-600 rounded inline-block" title="Lejupielādēt PDF">
                          <Download size={16} />
                        </a>
                        <button onClick={() => openEdit(invoice)} className="p-2 hover:bg-slate-600 rounded" title="Rediģēt">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(invoice.id)} className="p-2 hover:bg-red-600 rounded text-red-400" title="Dzēst">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Kopā rēķinu</div>
            <div className="text-2xl font-bold">{invoices.length}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Apmaksāti</div>
            <div className="text-2xl font-bold text-green-400">{invoices.filter(i => i.status === 'paid').length}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Gaida apmaksu</div>
            <div className="text-2xl font-bold text-yellow-400">
              {invoices.filter(i => ['draft', 'sent'].includes(i.status)).length}
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div className="text-gray-400 text-sm">Kopējā summa</div>
            <div className="text-2xl font-bold">
              {formatNumber(invoices.reduce((sum, i) => sum + parseFloat(i.total || 0), 0))} EUR
            </div>
          </div>
        </div>
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <InvoiceModal
          clients={clients}
          services={services}
          company={company}
          onSave={() => { setShowCreateModal(false); fetchData(); showToast('Rēķins izveidots!', 'success'); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {editingInvoice && (
        <InvoiceModal
          invoice={editingInvoice}
          clients={clients}
          services={services}
          company={company}
          onSave={() => { setEditingInvoice(null); fetchData(); showToast('Rēķins saglabāts!', 'success'); }}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {previewInvoice && (
        <InvoicePreview
          invoice={previewInvoice}
          items={previewInvoice.items || []}
          company={previewInvoice.company || company}
          onClose={() => setPreviewInvoice(null)}
          onRefresh={async () => {
            const data = await api(`/invoices/${previewInvoice.id}`);
            setPreviewInvoice(data);
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
