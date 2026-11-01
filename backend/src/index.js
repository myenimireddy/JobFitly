require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

// Import module routers
const profileRouter = require('./modules/profile/router');
const jobRouter = require('./modules/job/router');
const matchRouter = require('./modules/match/router');
const autofillRouter = require('./modules/autofill/router');
const documentsRouter = require('./modules/documents/router');
const { checkLLM } = require('./lib/llmStatus');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const url = req.originalUrl || '';
  // Match Ollama extract default (10m). Upload may run multiple passes → 20m.
  let ms = 10 * 60 * 1000;
  if (url.startsWith('/api/profile/upload')) ms = 20 * 60 * 1000;
  else if (url.startsWith('/health') || url.startsWith('/api/llm/status')) ms = 30_000;
  req.setTimeout(ms);
  res.setTimeout(ms, () => {
    if (!res.headersSent) {
      res.status(504).json({ success: false, data: null, error: 'Request timed out — LLM may be overloaded, please retry' });
    }
  });
  next();
});

/**
 * GET /health
 * Health check endpoint
 * @returns {Object} { success: true, data: { status: 'ok', version: string } }
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: config.version,
    },
    error: null,
  });
});

/**
 * GET /api/llm/status
 * Returns whether the configured LLM is reachable and what it is.
 */
app.get('/api/llm/status', async (req, res) => {
  const status = await checkLLM();
  res.json({ success: true, data: status, error: null });
});

// Mount module routers
app.use('/api/profile', profileRouter);
app.use('/api/job', jobRouter);
app.use('/api/match', matchRouter);
app.use('/api/autofill', autofillRouter);
app.use('/api/documents', documentsRouter);

// Global error handler
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  if ((config.llmProvider || 'ollama').toLowerCase() === 'ollama') {
    const LLMFactory = require('./llm/factory');
    try {
      const llm = LLMFactory.create();
      if (typeof llm.warmup === 'function') {
        llm.warmup();
      }
    } catch (err) {
      console.warn('[server] Ollama warmup skipped:', err.message);
    }
  }
});

// Node 18 defaults requestTimeout to 5 minutes — that killed long resume parses
server.requestTimeout = 20 * 60 * 1000;
server.headersTimeout = 21 * 60 * 1000;
server.timeout = 20 * 60 * 1000;

// Log crashes and exit cleanly so nodemon can restart the server
process.on('uncaughtException', (err) => {
  console.error('[server] ❌ Uncaught exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] ❌ Unhandled rejection:', reason);
  process.exit(1);
});
