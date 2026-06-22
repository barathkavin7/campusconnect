'use strict';

const pool = require('../config/db');

async function canAccessConversation(conversationId, user) {
  if (user.role === 'admin') return true;
  const [rows] = await pool.execute(`SELECT c.id FROM cc_conversations c LEFT JOIN cc_students s ON s.id=c.student_id LEFT JOIN cc_recruiters r ON r.id=c.recruiter_id WHERE c.id=? AND (s.user_id=? OR r.user_id=?)`, [conversationId, user.id, user.id]);
  return Boolean(rows.length);
}

async function listConversations(req, res, next) {
  try {
    let where = ''; const params = [];
    if (req.user.role === 'student') { where = 'WHERE s.user_id=?'; params.push(req.user.id); }
    if (req.user.role === 'recruiter') { where = 'WHERE r.user_id=?'; params.push(req.user.id); }
    const [rows] = await pool.execute(`SELECT c.id,c.updated_at,c.job_id,j.title,su.full_name student_name,ru.full_name recruiter_name,r.company_name,(SELECT body FROM cc_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM cc_messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) unread_count FROM cc_conversations c JOIN cc_students s ON s.id=c.student_id JOIN cc_users su ON su.id=s.user_id JOIN cc_recruiters r ON r.id=c.recruiter_id JOIN cc_users ru ON ru.id=r.user_id LEFT JOIN cc_jobs j ON j.id=c.job_id ${where} GROUP BY c.id ORDER BY c.updated_at DESC`, [req.user.id, ...params]);
    res.json({ conversations: rows });
  } catch (error) { next(error); }
}

async function startConversation(req, res, next) {
  try {
    let studentId; let recruiterId;
    if (req.user.role === 'student') {
      const [student] = await pool.execute('SELECT id FROM cc_students WHERE user_id=?', [req.user.id]);
      studentId = student[0].id; recruiterId = Number(req.body.recruiter_id);
    } else {
      const [recruiter] = await pool.execute('SELECT id FROM cc_recruiters WHERE user_id=?', [req.user.id]);
      recruiterId = recruiter[0].id; studentId = Number(req.body.student_id);
    }
    const jobId = req.body.job_id ? Number(req.body.job_id) : null;
    const [existing] = await pool.execute('SELECT id FROM cc_conversations WHERE student_id=? AND recruiter_id=? AND ((job_id IS NULL AND ? IS NULL) OR job_id=?)', [studentId, recruiterId, jobId, jobId]);
    if (existing.length) return res.json({ conversation_id: existing[0].id });
    const [result] = await pool.execute('INSERT INTO cc_conversations (student_id,recruiter_id,job_id) VALUES (?,?,?)', [studentId, recruiterId, jobId]);
    res.status(201).json({ conversation_id: result.insertId });
  } catch (error) { next(error); }
}

async function messages(req, res, next) {
  try {
    if (!(await canAccessConversation(req.params.id, req.user))) return res.status(403).json({ message: 'Conversation access denied.' });
    const [rows] = await pool.execute(`SELECT m.id,m.body,m.created_at,m.read_at,m.sender_id,u.full_name sender_name,u.role sender_role FROM cc_messages m JOIN cc_users u ON u.id=m.sender_id WHERE m.conversation_id=? ORDER BY m.created_at`, [req.params.id]);
    if (req.user.role !== 'admin') await pool.execute('UPDATE cc_messages SET read_at=NOW() WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL', [req.params.id, req.user.id]);
    res.json({ messages: rows });
  } catch (error) { next(error); }
}

module.exports = { listConversations, startConversation, messages, canAccessConversation };
