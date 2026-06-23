'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const configureSocket = require('./socket');
const { notFound, errorHandler } = require('./middleware/error');
const { authenticate } = require('./middleware/auth');
const { downloadFile } = require('./controllers/fileController');

for (const key of ['DB_HOST','DB_USER','DB_PASSWORD','JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.FRONTEND_ORIGIN || process.env.APP_URL || 'http://localhost:3000';
const io = new Server(server, { cors: { origin: allowedOrigin, credentials: true }, maxHttpBufferSize: 1e6 });

app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    strictTransportSecurity: false
  })
);
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false }), authRoutes);
app.use('/api', apiRoutes);
app.get('/uploads/:category/:filename', authenticate, downloadFile);
app.use(express.static(path.resolve(__dirname, '../frontend'), { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.get('/{*splat}', (req, res, next) => req.accepts('html') ? res.sendFile(path.resolve(__dirname, '../frontend/index.html')) : next());
app.use(notFound);
app.use(errorHandler);

configureSocket(io);

const port = Number(process.env.PORT || 3103);
async function start() {
  await pool.query('SELECT 1');
  server.listen(port, () => console.log(`CampusConnect is running on port ${port}`));
}

async function shutdown(signal) {
  console.log(`${signal} received; closing CampusConnect cleanly.`);
  io.close();
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => { console.error(error); shutdown('unhandledRejection'); });

if (require.main === module) {
  start().catch((error) => { console.error('CampusConnect could not start:', error); process.exit(1); });
}

module.exports = { app, server, io, start, shutdown };
