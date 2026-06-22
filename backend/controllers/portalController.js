'use strict';

const pool = require('../config/db');
const { calculateResumeScore, calculateRankingScore } = require('../utils/scoring');

async function audit(userId, action, entityType, entityId, req) {
  await pool.execute(
    'INSERT INTO cc_activity_logs (user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId || null, req.ip]
  );
}

async function refreshStudentScore(userId) {
  const [rows] = await pool.execute(`
    SELECT s.cgpa, s.github_url, s.linkedin_url, s.resume_path,
      (SELECT COUNT(*) FROM cc_student_skills ss WHERE ss.student_id = s.id) skills_count,
      (SELECT COUNT(*) FROM cc_projects p WHERE p.student_id = s.id) projects_count,
      (SELECT COUNT(*) FROM cc_certificates c WHERE c.student_id = s.id) certificates_count
    FROM cc_students s WHERE s.user_id = ?`, [userId]);
  if (!rows.length) return;
  const resumeScore = calculateResumeScore(rows[0]);
  const rankingScore = calculateRankingScore({ ...rows[0], resume_score: resumeScore });
  await pool.execute('UPDATE cc_students SET resume_score = ?, ranking_score = ? WHERE user_id = ?', [resumeScore, rankingScore, userId]);
}

async function dashboard(req, res, next) {
  try {
    if (req.user.role === 'admin') {
      const [metricsRows] = await pool.query(`SELECT
        (SELECT COUNT(*) FROM cc_users WHERE role='student' AND deleted_at IS NULL) total_students,
        (SELECT COUNT(*) FROM cc_users WHERE role='recruiter' AND deleted_at IS NULL) total_recruiters,
        (SELECT COUNT(*) FROM cc_jobs WHERE status='published') total_jobs,
        (SELECT COUNT(*) FROM cc_applications) total_applications,
        (SELECT COUNT(*) FROM cc_students WHERE cgpa >= 6.0) eligible_students,
        (SELECT COUNT(DISTINCT student_id) FROM cc_applications WHERE status='selected') placed_students,
        COALESCE((SELECT MAX(package_lpa) FROM cc_jobs),0) highest_package,
        COALESCE((SELECT AVG(package_lpa) FROM cc_jobs WHERE package_lpa IS NOT NULL),0) average_package`);
      const metrics = metricsRows[0];
      metrics.placement_percentage = metrics.eligible_students ? Number((metrics.placed_students * 100 / metrics.eligible_students).toFixed(1)) : 0;
      const [trend] = await pool.query(`SELECT DATE_FORMAT(created_at, '%b') label, COUNT(*) value FROM cc_applications WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY YEAR(created_at), MONTH(created_at) ORDER BY MIN(created_at)`);
      const [departments] = await pool.query(`SELECT d.name label, COUNT(DISTINCT CASE WHEN a.status='selected' THEN a.student_id END) value FROM cc_departments d LEFT JOIN cc_students s ON s.department_id=d.id LEFT JOIN cc_applications a ON a.student_id=s.id GROUP BY d.id ORDER BY value DESC`);
      const [recent] = await pool.query('SELECT l.*, u.full_name FROM cc_activity_logs l LEFT JOIN cc_users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 8');
      return res.json({ metrics, charts: { trend, departments }, recent });
    }
    if (req.user.role === 'recruiter') {
      const [metricsRows] = await pool.execute(`SELECT
        (SELECT COUNT(*) FROM cc_jobs WHERE recruiter_id=r.id) total_jobs,
        (SELECT COUNT(*) FROM cc_jobs WHERE recruiter_id=r.id AND status='published') active_jobs,
        (SELECT COUNT(*) FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id WHERE j.recruiter_id=r.id) total_applicants,
        (SELECT COUNT(*) FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id WHERE j.recruiter_id=r.id AND a.status='shortlisted') shortlisted
        FROM cc_recruiters r WHERE r.user_id=?`, [req.user.id]);
      const [recent] = await pool.execute(`SELECT a.id, a.status, a.created_at, u.full_name, j.title FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id JOIN cc_students s ON s.id=a.student_id JOIN cc_users u ON u.id=s.user_id JOIN cc_recruiters r ON r.id=j.recruiter_id WHERE r.user_id=? ORDER BY a.created_at DESC LIMIT 8`, [req.user.id]);
      return res.json({ metrics: metricsRows[0], recent });
    }
    await refreshStudentScore(req.user.id);
    const [metricsRows] = await pool.execute(`SELECT s.resume_score, s.ranking_score,
      (SELECT COUNT(*) FROM cc_applications WHERE student_id=s.id) applications,
      (SELECT COUNT(*) FROM cc_applications WHERE student_id=s.id AND status='shortlisted') shortlisted,
      (SELECT COUNT(*) FROM cc_saved_jobs WHERE student_id=s.id) saved_jobs,
      (SELECT COUNT(*) + 1 FROM cc_students s2 WHERE s2.ranking_score > s.ranking_score) overall_rank
      FROM cc_students s WHERE s.user_id=?`, [req.user.id]);
    const [recent] = await pool.execute(`SELECT a.id, a.status, a.updated_at, j.title, r.company_name FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id JOIN cc_students s ON s.id=a.student_id WHERE s.user_id=? ORDER BY a.updated_at DESC LIMIT 6`, [req.user.id]);
    const [recommended] = await pool.execute(`SELECT j.*, r.company_name FROM cc_jobs j JOIN cc_recruiters r ON r.id=j.recruiter_id WHERE j.status='published' AND j.application_deadline >= CURDATE() ORDER BY j.created_at DESC LIMIT 4`);
    res.json({ metrics: metricsRows[0], recent, recommended });
  } catch (error) { next(error); }
}

async function getProfile(req, res, next) {
  try {
    if (req.user.role === 'student') {
      const [rows] = await pool.execute(`SELECT u.full_name,u.email,u.avatar_path,s.*,d.name department_name,
        GROUP_CONCAT(DISTINCT sk.name ORDER BY sk.name SEPARATOR ', ') skills
        FROM cc_students s JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id LEFT JOIN cc_student_skills ss ON ss.student_id=s.id LEFT JOIN cc_skills sk ON sk.id=ss.skill_id WHERE s.user_id=? GROUP BY s.id`, [req.user.id]);
      const [projects] = await pool.execute('SELECT * FROM cc_projects WHERE student_id=(SELECT id FROM cc_students WHERE user_id=?) ORDER BY created_at DESC', [req.user.id]);
      const [certificates] = await pool.execute('SELECT * FROM cc_certificates WHERE student_id=(SELECT id FROM cc_students WHERE user_id=?) ORDER BY issued_on DESC', [req.user.id]);
      const [skills] = await pool.execute('SELECT sk.id,sk.name,ss.proficiency FROM cc_student_skills ss JOIN cc_skills sk ON sk.id=ss.skill_id WHERE ss.student_id=(SELECT id FROM cc_students WHERE user_id=?) ORDER BY sk.name', [req.user.id]);
      return res.json({ profile: rows[0], projects, certificates, skills });
    }
    const [rows] = await pool.execute('SELECT u.full_name,u.email,u.avatar_path,r.* FROM cc_recruiters r JOIN cc_users u ON u.id=r.user_id WHERE r.user_id=?', [req.user.id]);
    res.json({ profile: rows[0] });
  } catch (error) { next(error); }
}

async function updateProfile(req, res, next) {
  try {
    await pool.execute('UPDATE cc_users SET full_name=? WHERE id=?', [req.body.full_name, req.user.id]);
    if (req.user.role === 'student') {
      const fields = ['department_id','academic_year','cgpa','linkedin_url','github_url','portfolio_url','bio'];
      const values = fields.map((key) => req.body[key] || null);
      await pool.execute(`UPDATE cc_students SET ${fields.map((key) => `${key}=?`).join(',')} WHERE user_id=?`, [...values, req.user.id]);
      await refreshStudentScore(req.user.id);
    } else {
      const fields = ['company_name','industry','website','description','headquarters','company_size'];
      const values = fields.map((key) => req.body[key] || null);
      await pool.execute(`UPDATE cc_recruiters SET ${fields.map((key) => `${key}=?`).join(',')} WHERE user_id=?`, [...values, req.user.id]);
    }
    await audit(req.user.id, 'Updated profile', req.user.role, null, req);
    res.json({ message: 'Profile updated successfully.' });
  } catch (error) { next(error); }
}

async function uploadResume(req, res, next) {
  try {
    if (!req.file) return res.status(422).json({ message: 'Select a PDF resume.' });
    const filePath = `/uploads/resumes/${req.file.filename}`;
    await pool.execute('UPDATE cc_students SET resume_path=? WHERE user_id=?', [filePath, req.user.id]);
    await refreshStudentScore(req.user.id);
    res.json({ message: 'Resume uploaded and score recalculated.', path: filePath });
  } catch (error) { next(error); }
}

async function addCertificate(req, res, next) {
  try {
    if (!req.file) return res.status(422).json({ message: 'Select a certificate file.' });
    const [result] = await pool.execute(`INSERT INTO cc_certificates (student_id,name,issuer,issued_on,file_path) VALUES ((SELECT id FROM cc_students WHERE user_id=?),?,?,?,?)`, [req.user.id, req.body.name, req.body.issuer || null, req.body.issued_on || null, `/uploads/certificates/${req.file.filename}`]);
    await refreshStudentScore(req.user.id);
    res.status(201).json({ message: 'Certificate added.', id: result.insertId });
  } catch (error) { next(error); }
}

async function addSkill(req, res, next) {
  try {
    const [skill] = await pool.execute('INSERT INTO cc_skills (name) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [req.body.name.trim()]);
    await pool.execute('INSERT IGNORE INTO cc_student_skills (student_id,skill_id) VALUES ((SELECT id FROM cc_students WHERE user_id=?),?)', [req.user.id, skill.insertId]);
    await refreshStudentScore(req.user.id);
    res.status(201).json({ message: 'Skill added.' });
  } catch (error) { next(error); }
}

async function removeSkill(req, res, next) {
  try {
    await pool.execute('DELETE FROM cc_student_skills WHERE student_id=(SELECT id FROM cc_students WHERE user_id=?) AND skill_id=?', [req.user.id, req.params.id]);
    await refreshStudentScore(req.user.id);
    res.json({ message: 'Skill removed.' });
  } catch (error) { next(error); }
}

async function addProject(req, res, next) {
  try {
    const [result] = await pool.execute('INSERT INTO cc_projects (student_id,title,description,technologies,project_url,github_url) VALUES ((SELECT id FROM cc_students WHERE user_id=?),?,?,?,?,?)', [req.user.id, req.body.title, req.body.description || null, req.body.technologies || null, req.body.project_url || null, req.body.github_url || null]);
    await refreshStudentScore(req.user.id);
    res.status(201).json({ message: 'Project added.', id: result.insertId });
  } catch (error) { next(error); }
}

async function uploadCompanyLogo(req, res, next) {
  try {
    if (!req.file) return res.status(422).json({ message: 'Select a PNG, JPG, or WebP logo.' });
    const filePath = `/uploads/logos/${req.file.filename}`;
    await pool.execute('UPDATE cc_recruiters SET logo_path=? WHERE user_id=?', [filePath, req.user.id]);
    res.json({ message: 'Company logo updated.', path: filePath });
  } catch (error) { next(error); }
}

async function deleteProject(req, res, next) {
  try {
    await pool.execute('DELETE FROM cc_projects WHERE id=? AND student_id=(SELECT id FROM cc_students WHERE user_id=?)', [req.params.id, req.user.id]);
    await refreshStudentScore(req.user.id);
    res.json({ message: 'Project removed.' });
  } catch (error) { next(error); }
}

module.exports = { dashboard, getProfile, updateProfile, uploadResume, uploadCompanyLogo, addCertificate, addSkill, removeSkill, addProject, deleteProject, refreshStudentScore, audit };
