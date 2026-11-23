// ============================================
// PANDA MOTORS API SERVER
// Version: 4.1.0
// Features: Auth + RBAC + Bookings + Admin Analytics + Reports
// ============================================

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { buildPoolConfig } from './config/databasePoolConfig.js';
import { closeDatabase } from './config/db.js';
import { inspectDatabaseReadiness } from './config/databaseReadiness.js';
import { resolveRuntimeSecurity } from './config/security.js';
import { exchangeRateRefreshWorker } from './workers/exchangeRateRefreshWorker.js';


// ============================================
// IMPORT ROUTES
// ============================================
import authRoutes from './routes/authRoutes.js';
import carsRoutes from './routes/carsRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import exchangeRateRoutes from './routes/exchangeRateRoutes.js';
import { attachExchangeRateWorker } from './workers/exchangeRateWorkerLifecycle.js';

const app = express();
const PORT = process.env.PORT || 5000;
const localOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173'];
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS !== undefined
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean)
  : ['production','staging'].includes(process.env.NODE_ENV) ? [] : localOrigins;
try {
  buildPoolConfig();
  if (!process.env.JWT_SECRET?.trim()) throw new Error('AUTH_CONFIG_INVALID');
  // Preserve Sprint 15 production secrets and exact HTTPS CORS requirements.
  if (process.env.NODE_ENV === 'production') resolveRuntimeSecurity();
  if (['production','staging'].includes(process.env.NODE_ENV) &&
      (Buffer.byteLength(process.env.JWT_SECRET || '', 'utf8') < 32 ||
       /^(replace|change|example|your[_-])/i.test(process.env.JWT_SECRET || ''))) {
    throw new Error('AUTH_CONFIG_INVALID');
  }
  if (process.env.NODE_ENV === 'production' && !allowedOrigins.length) {
    throw new Error('CORS_CONFIG_INVALID');
  }
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('CORS_CONFIG_INVALID');
  }
} catch {
  console.error('API configuration invalid; verify database, JWT and CORS settings.');
  process.exit(1);
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.info('Incoming request', {
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
  next();
});

// ============================================
// REGISTER ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/cars', carsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exchange-rates', exchangeRateRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Panda Motors API is running',
    version: '4.1.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/bookings/create',
      'GET  /api/bookings/check-availability',
      'GET  /api/bookings/available-slots/:carId/:date',
      'GET  /api/bookings/weekly-availability/:carId',
      'GET  /api/bookings/my-bookings',
      'DELETE /api/bookings/:id/cancel',
      'GET  /api/admin/stats',
      'GET  /api/admin/pending-approvals',
      'GET  /api/admin/bookings',
      'PUT  /api/admin/bookings/:id/status',
      'PUT  /api/admin/bookings/bulk',
      'PUT  /api/admin/cars/:id/approve',
      'PUT  /api/admin/cars/:id/reject',
      'PUT  /api/admin/cars/:id',
      'DELETE /api/admin/cars/:id',
      'GET  /api/exchange-rates'
    ]
  });
});

app.get('/api/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let ready = false;
  try { ready = (await inspectDatabaseReadiness()).ready; } catch { /* Public response contains no database details. */ }
  res.status(ready ? 200 : 503).json({ success: ready, status: ready ? 'READY' : 'NOT_READY' });
});

// Opt-in staging identity; never exposes credentials or database details.
if (process.env.NODE_ENV === 'staging' && process.env.STAGING_DEPLOYMENT_ID) {
  app.get('/api/staging-info', (req, res) => {
    const revision = process.env.RENDER === 'true' ? process.env.RENDER_GIT_COMMIT : process.env.STAGING_SOURCE_REVISION;
    res.set('Cache-Control', 'no-store').json({
      environment: 'staging',
      deployment: process.env.STAGING_DEPLOYMENT_ID,
      revision: /^[a-f0-9]{40}$/.test(revision ?? '') ? revision : null,
    });
  });
}

// ============================================
// ROOT
// ============================================
app.get('/', (req, res) => {
  res.json({ message: 'Panda Motors API', docs: '/api/health' });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      path: req.originalUrl
    }
  });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED');

  console.error('Unhandled error', {
    code,
    status,
    method: req.method,
    path: req.originalUrl,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });

  res.status(status).json({
    success: false,
    error: {
      code,
      message: status >= 500 ? 'Internal server error' : (err.message || 'Request failed')
    }
  });
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('========================================');
  console.log(`?? Panda Motors API running on http://localhost:${PORT}`);
  console.log(`?? Health check: http://localhost:${PORT}/api/health`);
  console.log('========================================');
  console.log('\n?? Routes loaded:');
  console.log('   /api/auth');
  console.log('   /api/cars');
  console.log('   /api/bookings');
  console.log('   /api/admin');
  console.log('   /api/exchange-rates');
  console.log('========================================\n');
});
attachExchangeRateWorker(server);

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  exchangeRateRefreshWorker.stop();
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    try {
      await exchangeRateRefreshWorker.drain();
      await closeDatabase();
      process.exitCode = exitCode;
    } catch { process.exitCode = 1; }
    clearTimeout(timeout);
  });
  server.closeIdleConnections?.();
}
process.once('SIGTERM', () => shutdown());
process.once('SIGINT', () => shutdown());
server.once('error', () => {
  console.error('API listener unavailable.');
  shutdown(1);
});
