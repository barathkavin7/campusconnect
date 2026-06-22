'use strict';

function notFound(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} was not found.` });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Uploaded file is too large.' });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That record already exists.' });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ message: status >= 500 ? 'An unexpected server error occurred.' : error.message });
}

module.exports = { notFound, errorHandler };
