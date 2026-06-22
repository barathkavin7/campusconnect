'use strict';

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const validator = require('validator');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const REQUIRED_DB_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const MIN_PASSWORD_LENGTH = 14;

function requireDatabaseEnvironment() {
  const missing = REQUIRED_DB_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing database environment variable(s): ${missing.join(', ')}. Create campusconnect/.env before running this script.`);
  }
}

function generatedPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function resolveBootstrapInput() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const fullName = String(process.env.ADMIN_FULL_NAME || 'CampusConnect Administrator').trim();
  const shouldGeneratePassword = String(process.env.ADMIN_GENERATE_PASSWORD || '').toLowerCase() === 'true';
  const password = shouldGeneratePassword ? generatedPassword() : String(process.env.ADMIN_PASSWORD || '');

  if (!email || !validator.isEmail(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  if (!fullName) throw new Error('ADMIN_FULL_NAME cannot be empty.');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  return { email, fullName, password, generated: shouldGeneratePassword };
}

async function main() {
  requireDatabaseEnvironment();
  const { email, fullName, password, generated } = resolveBootstrapInput();
  const passwordHash = await bcrypt.hash(password, 12);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id FROM cc_users WHERE email=? LIMIT 1', [email]);

    let adminId;
    if (existing.length) {
      adminId = existing[0].id;
      await connection.execute(
        `UPDATE cc_users
         SET full_name=?, password_hash=?, role='admin', status='active', approved_at=COALESCE(approved_at,NOW()), rejected_reason=NULL, deleted_at=NULL
         WHERE id=?`,
        [fullName, passwordHash, adminId]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO cc_users (full_name,email,password_hash,role,status,approved_at)
         VALUES (?,?,?,'admin','active',NOW())`,
        [fullName, email, passwordHash]
      );
      adminId = result.insertId;
    }

    await connection.execute(
      `INSERT INTO cc_activity_logs (user_id,action,entity_type,entity_id,metadata)
       VALUES (?,?,?,?,?)`,
      [adminId, 'bootstrap_admin', 'cc_users', adminId, JSON.stringify({ email, generated_password: generated })]
    );

    await connection.commit();
    console.log(`CampusConnect admin account is ready: ${email}`);
    if (generated) {
      console.log('Generated admin password. Store it in a password manager now; it will not be shown again:');
      console.log(password);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(`Admin bootstrap failed: ${error.message}`);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
