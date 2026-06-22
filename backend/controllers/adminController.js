'use strict';

const pool = require('../config/db');
const { audit } = require('./portalController');

async function pendingApprovals(req, res, next) {
  try {
    const [students] = await pool.query(`SELECT u.id,u.full_name,u.email,u.created_at,s.register_number,s.academic_year,s.cgpa,d.name department_name FROM cc_users u JOIN cc_students s ON s.user_id=u.id LEFT JOIN cc_departments d ON d.id=s.department_id WHERE u.status='pending' ORDER BY u.created_at`);
    const [recruiters] = await pool.query(`SELECT u.id,u.full_name,u.email,u.created_at,r.company_name,r.industry,r.website,r.verification_document FROM cc_users u JOIN cc_recruiters r ON r.user_id=u.id WHERE u.status='pending' ORDER BY u.created_at`);
    res.json({ students, recruiters });
  } catch (error) { next(error); }
}

async function decideApproval(req, res, next) {
  try {
    const status = req.body.decision === 'approve' ? 'active' : 'rejected';
    const [target] = await pool.execute("SELECT id,full_name,email,role,status FROM cc_users WHERE id=? AND role IN ('student','recruiter')", [req.params.id]);
    if (!target.length) return res.status(404).json({ message: 'Account not found.' });
    await pool.execute('UPDATE cc_users SET status=?,approved_by=?,approved_at=IF(?="active",NOW(),NULL) WHERE id=?', [status, req.user.id, status, req.params.id]);
    await pool.execute('INSERT INTO cc_notifications (user_id,title,message,type) VALUES (?,?,?,?)', [req.params.id, `Account ${status}`, status === 'active' ? 'Your CampusConnect account is approved. You can now sign in.' : (req.body.reason || 'Your registration could not be approved.'), 'approval']);
    await audit(req.user.id, `${status === 'active' ? 'Approved' : 'Rejected'} ${target[0].role}`, 'user', req.params.id, req);
    res.json({ message: `Account ${status}.` });
  } catch (error) { next(error); }
}

async function users(req, res, next) {
  try {
    const conditions = ['u.deleted_at IS NULL']; const params = [];
    if (req.query.role) { conditions.push('u.role=?'); params.push(req.query.role); }
    if (req.query.status) { conditions.push('u.status=?'); params.push(req.query.status); }
    if (req.query.search) { conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
    const [rows] = await pool.execute(`SELECT u.id,u.full_name,u.email,u.role,u.status,u.created_at,u.last_login_at,COALESCE(s.register_number,r.company_name) reference FROM cc_users u LEFT JOIN cc_students s ON s.user_id=u.id LEFT JOIN cc_recruiters r ON r.user_id=u.id WHERE ${conditions.join(' AND ')} ORDER BY u.created_at DESC`, params);
    res.json({ users: rows });
  } catch (error) { next(error); }
}

async function updateUser(req, res, next) {
  try {
    if (!['active','suspended','rejected'].includes(req.body.status)) return res.status(422).json({ message: 'Invalid user status.' });
    if (Number(req.params.id) === req.user.id) return res.status(422).json({ message: 'You cannot change your own status.' });
    await pool.execute('UPDATE cc_users SET status=? WHERE id=?', [req.body.status, req.params.id]);
    await audit(req.user.id, `Changed user status to ${req.body.status}`, 'user', req.params.id, req);
    res.json({ message: 'User status updated.' });
  } catch (error) { next(error); }
}

async function departments(req, res, next) {
  try {
    const [rows] = await pool.query(`SELECT d.*,(SELECT COUNT(*) FROM cc_students s WHERE s.department_id=d.id) student_count FROM cc_departments d ORDER BY d.name`);
    res.json({ departments: rows });
  } catch (error) { next(error); }
}

async function addDepartment(req, res, next) {
  try {
    const [result] = await pool.execute('INSERT INTO cc_departments (name,code,hod_name,is_active) VALUES (?,?,?,1)', [req.body.name, req.body.code.toUpperCase(), req.body.hod_name || null]);
    res.status(201).json({ message: 'Department added.', id: result.insertId });
  } catch (error) { next(error); }
}

async function updateDepartment(req, res, next) {
  try {
    await pool.execute('UPDATE cc_departments SET name=?,code=?,hod_name=?,is_active=? WHERE id=?', [req.body.name, req.body.code.toUpperCase(), req.body.hod_name || null, req.body.is_active === false ? 0 : 1, req.params.id]);
    res.json({ message: 'Department updated.' });
  } catch (error) { next(error); }
}

async function publishAnnouncement(req, res, next) {
  try {
    const [result] = await pool.execute('INSERT INTO cc_announcements (author_id,title,content,audience,is_pinned,is_published,published_at,expires_at) VALUES (?,?,?,?,?,1,NOW(),?)', [req.user.id, req.body.title, req.body.content, req.body.audience || 'all', req.body.is_pinned ? 1 : 0, req.body.expires_at || null]);
    const audience = req.body.audience || 'all';
    const roleFilter = audience === 'all' ? '' : ' AND role=?';
    const params = audience === 'all' ? [req.body.title, req.body.content] : [req.body.title, req.body.content, audience];
    await pool.execute(`INSERT INTO cc_notifications (user_id,title,message,type,link) SELECT id,?,?,'announcement','announcements' FROM cc_users WHERE status='active'${roleFilter}`, params);
    await audit(req.user.id, 'Published announcement', 'announcement', result.insertId, req);
    res.status(201).json({ message: 'Announcement published.', id: result.insertId });
  } catch (error) { next(error); }
}

async function activityLogs(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT l.*,u.full_name,u.role FROM cc_activity_logs l LEFT JOIN cc_users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 500');
    res.json({ logs: rows });
  } catch (error) { next(error); }
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

async function report(req, res, next) {
  try {
    let rows; let filename;
    if (req.params.type === 'students') {
      [rows] = await pool.query(`SELECT u.full_name,u.email,u.status,s.register_number,d.name department,s.academic_year,s.cgpa,s.resume_score,s.ranking_score FROM cc_students s JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id ORDER BY d.name,u.full_name`);
      filename = 'campusconnect-student-report.csv';
    } else if (req.params.type === 'recruiters') {
      [rows] = await pool.query(`SELECT u.full_name,u.email,u.status,r.company_name,r.industry,r.website,(SELECT COUNT(*) FROM cc_jobs j WHERE j.recruiter_id=r.id) jobs_posted FROM cc_recruiters r JOIN cc_users u ON u.id=r.user_id ORDER BY r.company_name`);
      filename = 'campusconnect-recruiter-report.csv';
    } else if (req.params.type === 'placements') {
      [rows] = await pool.query(`SELECT u.full_name,s.register_number,d.name department,r.company_name,j.title,j.package_lpa,a.status,a.status_updated_at FROM cc_applications a JOIN cc_students s ON s.id=a.student_id JOIN cc_users u ON u.id=s.user_id JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id LEFT JOIN cc_departments d ON d.id=s.department_id WHERE j.type='placement' ORDER BY a.status_updated_at DESC`);
      filename = 'campusconnect-placement-report.csv';
    } else return res.status(404).json({ message: 'Report type not found.' });
    const headers = rows.length ? Object.keys(rows[0]) : ['No records'];
    const csv = [headers.map(csvValue).join(','), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (error) { next(error); }
}

async function sendNotification(req, res, next) {
  try {
    const [result] = await pool.execute('INSERT INTO cc_notifications (user_id,title,message,type,link) VALUES (?,?,?,?,?)', [req.body.user_id, req.body.title, req.body.message, req.body.type || 'general', req.body.link || null]);
    res.status(201).json({ message: 'Notification sent.', id: result.insertId });
  } catch (error) { next(error); }
}

module.exports = { pendingApprovals, decideApproval, users, updateUser, departments, addDepartment, updateDepartment, publishAnnouncement, activityLogs, report, sendNotification };
