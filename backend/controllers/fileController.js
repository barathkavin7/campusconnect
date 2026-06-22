'use strict';

const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

const allowedCategories = new Set(['resumes', 'certificates', 'company_docs', 'logos']);

async function downloadFile(req, res, next) {
  try {
    const { category, filename } = req.params;
    if (!allowedCategories.has(category) || path.basename(filename) !== filename) return res.status(400).json({ message: 'Invalid file path.' });
    const storedPath = `/uploads/${category}/${filename}`;
    let allowed = req.user.role === 'admin' || category === 'logos';
    if (!allowed && req.user.role === 'recruiter' && ['resumes', 'certificates'].includes(category)) allowed = true;
    if (!allowed && req.user.role === 'recruiter' && category === 'company_docs') {
      const [rows] = await pool.execute('SELECT id FROM cc_recruiters WHERE user_id=? AND verification_document=?', [req.user.id, storedPath]);
      allowed = Boolean(rows.length);
    }
    if (!allowed && req.user.role === 'student' && category === 'resumes') {
      const [rows] = await pool.execute('SELECT id FROM cc_students WHERE user_id=? AND resume_path=?', [req.user.id, storedPath]);
      allowed = Boolean(rows.length);
    }
    if (!allowed && req.user.role === 'student' && category === 'certificates') {
      const [rows] = await pool.execute('SELECT c.id FROM cc_certificates c JOIN cc_students s ON s.id=c.student_id WHERE s.user_id=? AND c.file_path=?', [req.user.id, storedPath]);
      allowed = Boolean(rows.length);
    }
    if (!allowed) return res.status(403).json({ message: 'You do not have permission to access this file.' });
    const absolutePath = path.resolve(__dirname, '../../uploads', category, filename);
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ message: 'File not found.' });
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.download(absolutePath, filename);
  } catch (error) { next(error); }
}

module.exports = { downloadFile };
