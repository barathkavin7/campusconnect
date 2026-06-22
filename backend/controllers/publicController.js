'use strict';

const pool = require('../config/db');

async function overview(req, res, next) {
  try {
    const [statsRows] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM cc_users WHERE role='student' AND status='active') students,
      (SELECT COUNT(*) FROM cc_users WHERE role='recruiter' AND status='active') recruiters,
      (SELECT COUNT(*) FROM cc_jobs WHERE status='published') opportunities,
      (SELECT COUNT(DISTINCT student_id) FROM cc_applications WHERE status='selected') placements`);
    const [companies] = await pool.query(`SELECT r.company_name,r.industry,r.logo_path,COUNT(j.id) opportunities FROM cc_recruiters r JOIN cc_users u ON u.id=r.user_id LEFT JOIN cc_jobs j ON j.recruiter_id=r.id AND j.status='published' WHERE u.status='active' GROUP BY r.id ORDER BY opportunities DESC,r.company_name LIMIT 8`);
    const [departments] = await pool.query('SELECT id,name,code FROM cc_departments WHERE is_active=1 ORDER BY name');
    res.json({ stats: statsRows[0], companies, departments });
  } catch (error) { next(error); }
}

async function contact(req, res, next) {
  try {
    const [result] = await pool.execute('INSERT INTO cc_contact_messages (name,email,subject,message) VALUES (?,?,?,?)', [req.body.name, req.body.email, req.body.subject, req.body.message]);
    res.status(201).json({ message: 'Thanks—your message has reached the placement team.', id: result.insertId });
  } catch (error) { next(error); }
}

module.exports = { overview, contact };
