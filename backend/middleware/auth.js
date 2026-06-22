'use strict';

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authenticate(req, res, next) {
  try {
    const value = req.headers.authorization || '';
    const token = value.startsWith('Bearer ') ? value.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, email, role, status, full_name FROM cc_users WHERE id = ? AND deleted_at IS NULL',
      [payload.sub]
    );
    if (!rows.length || rows[0].status !== 'active') {
      return res.status(401).json({ message: 'Your account is not active.' });
    }
    req.user = rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Session expired.' });
    return res.status(401).json({ message: 'Invalid authentication token.' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission for this action.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
