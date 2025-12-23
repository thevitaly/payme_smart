const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const { testConnection } = require('./config/database');
const invoicesRoutes = require('./routes/invoices');
const clientsRoutes = require('./routes/clients');
const servicesRoutes = require('./routes/services');
const billsRoutes = require('./routes/bills');
const gmailRoutes = require('./routes/gmail');
const dropboxRoutes = require('./routes/dropbox');

const app = express();
const PORT = process.env.PORT || 3002;

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'JVK Payme Pro',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/invoices', invoicesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/dropbox', dropboxRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const start = async () => {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('⚠️ Server started without DB connection');
  }

  app.listen(PORT, () => {
    console.log(`🚀 JVK Payme Pro API running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📄 Invoices API: http://localhost:${PORT}/api/invoices`);
  });
};

start();
