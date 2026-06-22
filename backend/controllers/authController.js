'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'campusconnect'
  });
}

async function registerStudent(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { full_name, email, password, register_number, department_id, academic_year } = req.body;
    if (String(password).length < 8) return res.status(422).json({ message: 'Password must be at least 8 characters.' });
    await connection.beginTransaction();
    const passwordHash = await bcrypt.hash(password, 12);
    const [userResult] = await connection.execute(
      "INSERT INTO cc_users (full_name, email, password_hash, role, status) VALUES (?, LOWER(?), ?, 'student', 'pending')",
      [full_name.trim(), email.trim(), passwordHash]
    );
    await connection.execute(
      'INSERT INTO cc_students (user_id, register_number, department_id, academic_year) VALUES (?, ?, ?, ?)',
      [userResult.insertId, register_number.trim(), Number(department_id), Number(academic_year)]
    );
    await connection.execute(
      "INSERT INTO cc_notifications (user_id, title, message, type) SELECT id, 'Student awaiting approval', ?, 'approval' FROM cc_users WHERE role = 'admin' AND status = 'active'",
      [`${full_name} submitted a student registration.`]
    );
    await connection.commit();
    res.status(201).json({ message: 'Registration submitted. A placement officer will review your account.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

async function registerRecruiter(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { full_name, email, password, company_name, industry, website, description } = req.body;
    if (!req.file) return res.status(422).json({ message: 'A company verification document is required.' });
    if (String(password).length < 8) return res.status(422).json({ message: 'Password must be at least 8 characters.' });
    await connection.beginTransaction();
    const passwordHash = await bcrypt.hash(password, 12);
    const [userResult] = await connection.execute(
      "INSERT INTO cc_users (full_name, email, password_hash, role, status) VALUES (?, LOWER(?), ?, 'recruiter', 'pending')",
      [full_name.trim(), email.trim(), passwordHash]
    );
    await connection.execute(
      'INSERT INTO cc_recruiters (user_id, company_name, industry, website, description, verification_document) VALUES (?, ?, ?, ?, ?, ?)',
      [userResult.insertId, company_name.trim(), industry.trim(), website || null, description || null, `/uploads/company_docs/${req.file.filename}`]
    );
    await connection.execute(
      "INSERT INTO cc_notifications (user_id, title, message, type) SELECT id, 'Recruiter awaiting verification', ?, 'approval' FROM cc_users WHERE role = 'admin' AND status = 'active'",
      [`${company_name} submitted recruiter verification.`]
    );
    await connection.commit();
    res.status(201).json({ message: 'Verification submitted. You can sign in after approval.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
}

async function login(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM cc_users WHERE email = LOWER(?) AND deleted_at IS NULL LIMIT 1', [req.body.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: `This account is ${user.status}. Please contact the placement office.` });
    }
    await pool.execute('UPDATE cc_users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await pool.execute('INSERT INTO cc_activity_logs (user_id, action, entity_type, ip_address) VALUES (?, ?, ?, ?)', [user.id, 'Signed in', 'authentication', req.ip]);
    res.json({
      token: issueToken(user),
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, avatar_path: user.avatar_path }
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const table = req.user.role === 'student' ? 'cc_students' : req.user.role === 'recruiter' ? 'cc_recruiters' : null;
    let profile = {};
    if (table) {
      const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE user_id = ?`, [req.user.id]);
      profile = rows[0] || {};
    }
    res.json({ user: req.user, profile });
  } catch (error) {
    next(error);
  }
}

module.exports = { registerStudent, registerRecruiter, login, me };
