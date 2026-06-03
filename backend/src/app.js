require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const app = express();

// Security middleware (disabled in dev for CORS)
if (config.nodeEnv !== 'development') {
  app.use(helmet());
}

// CORS
const isDev = (process.env.NODE_ENV || 'development') === 'development';
app.use(cors({
  origin: isDev ? true : config.corsOrigin, // Allow all origins in dev
  credentials: !isDev, // Don't use credentials with wildcard in dev
}));

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
const packageJson = require('../package.json');
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: packageJson.version,
    },
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;
