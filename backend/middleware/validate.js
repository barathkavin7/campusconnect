'use strict';

const validator = require('validator');

function required(fields) {
  return (req, res, next) => {
    const missing = fields.filter((field) => req.body[field] === undefined || String(req.body[field]).trim() === '');
    if (missing.length) return res.status(422).json({ message: `Required fields: ${missing.join(', ')}.` });
    next();
  };
}

function validateEmail(req, res, next) {
  if (!validator.isEmail(String(req.body.email || ''))) return res.status(422).json({ message: 'Enter a valid email address.' });
  next();
}

module.exports = { required, validateEmail };
