'use strict';

const pool = require('../config/db');
const { audit } = require('./portalController');

async function listJobs(req, res, next) {
  try {
    const conditions = ["j.status='published'"];
    const params = [];
    if (req.query.type) { conditions.push('j.type=?'); params.push(req.query.type); }
    if (req.query.search) { conditions.push('(j.title LIKE ? OR r.company_name LIKE ? OR j.skills_required LIKE ?)'); const term = `%${req.query.search}%`; params.push(term, term, term); }
    if (req.query.location) { conditions.push('j.location LIKE ?'); params.push(`%${req.query.location}%`); }
    const [rows] = await pool.execute(`SELECT j.*,r.company_name,r.logo_path,
      (SELECT COUNT(*) FROM cc_applications a WHERE a.job_id=j.id) applicant_count
      FROM cc_jobs j JOIN cc_recruiters r ON r.id=j.recruiter_id
      WHERE ${conditions.join(' AND ')} ORDER BY j.featured DESC,j.created_at DESC`, params);
    res.json({ jobs: rows });
  } catch (error) { next(error); }
}

async function myJobs(req, res, next) {
  try {
    const [rows] = await pool.execute(`SELECT j.*,(SELECT COUNT(*) FROM cc_applications a WHERE a.job_id=j.id) applicant_count FROM cc_jobs j JOIN cc_recruiters r ON r.id=j.recruiter_id WHERE r.user_id=? ORDER BY j.created_at DESC`, [req.user.id]);
    res.json({ jobs: rows });
  } catch (error) { next(error); }
}

async function createJob(req, res, next) {
  try {
    const fields = ['type','title','description','location','work_mode','duration','stipend','package_lpa','openings','eligibility_cgpa','eligible_departments','skills_required','application_deadline'];
    const values = fields.map((key) => req.body[key] === '' ? null : req.body[key]);
    const [result] = await pool.execute(`INSERT INTO cc_jobs (recruiter_id,${fields.join(',')},status) VALUES ((SELECT id FROM cc_recruiters WHERE user_id=?),${fields.map(() => '?').join(',')},'published')`, [req.user.id, ...values]);
    await audit(req.user.id, `Published ${req.body.type}`, 'job', result.insertId, req);
    res.status(201).json({ message: 'Opportunity published.', id: result.insertId });
  } catch (error) { next(error); }
}

async function updateJob(req, res, next) {
  try {
    const allowed = ['type','title','description','location','work_mode','duration','stipend','package_lpa','openings','eligibility_cgpa','eligible_departments','skills_required','application_deadline','status'];
    const fields = allowed.filter((key) => req.body[key] !== undefined);
    if (!fields.length) return res.status(422).json({ message: 'No changes supplied.' });
    const params = fields.map((key) => req.body[key] === '' ? null : req.body[key]);
    const ownership = req.user.role === 'admin' ? '' : ' AND recruiter_id=(SELECT id FROM cc_recruiters WHERE user_id=?)';
    if (req.user.role !== 'admin') params.push(req.user.id);
    const [result] = await pool.execute(`UPDATE cc_jobs SET ${fields.map((key) => `${key}=?`).join(',')} WHERE id=?${ownership}`, [...params.slice(0, fields.length), req.params.id, ...params.slice(fields.length)]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Opportunity not found.' });
    res.json({ message: 'Opportunity updated.' });
  } catch (error) { next(error); }
}

async function deleteJob(req, res, next) {
  try {
    const ownership = req.user.role === 'admin' ? '' : ' AND recruiter_id=(SELECT id FROM cc_recruiters WHERE user_id=?)';
    const params = req.user.role === 'admin' ? [req.params.id] : [req.params.id, req.user.id];
    const [result] = await pool.execute(`UPDATE cc_jobs SET status='closed' WHERE id=?${ownership}`, params);
    if (!result.affectedRows) return res.status(404).json({ message: 'Opportunity not found.' });
    res.json({ message: 'Opportunity closed.' });
  } catch (error) { next(error); }
}

async function apply(req, res, next) {
  try {
    const [eligibility] = await pool.execute(`SELECT j.id,j.title,j.eligibility_cgpa,j.application_deadline,s.id student_id,s.cgpa,s.resume_path FROM cc_jobs j JOIN cc_students s ON s.user_id=? WHERE j.id=? AND j.status='published'`, [req.user.id, req.params.id]);
    const item = eligibility[0];
    if (!item) return res.status(404).json({ message: 'Opportunity is unavailable.' });
    if (new Date(item.application_deadline) < new Date()) return res.status(422).json({ message: 'The application deadline has passed.' });
    if (Number(item.cgpa) < Number(item.eligibility_cgpa)) return res.status(422).json({ message: `A minimum CGPA of ${item.eligibility_cgpa} is required.` });
    if (!item.resume_path) return res.status(422).json({ message: 'Upload your resume before applying.' });
    const [result] = await pool.execute("INSERT INTO cc_applications (job_id,student_id,status,cover_letter) VALUES (?,?,'applied',?)", [req.params.id, item.student_id, req.body.cover_letter || null]);
    await pool.execute(`INSERT INTO cc_notifications (user_id,title,message,type,link) SELECT r.user_id,'New application',?,'application','applications' FROM cc_jobs j JOIN cc_recruiters r ON r.id=j.recruiter_id WHERE j.id=?`, [`A student applied for ${item.title}.`, req.params.id]);
    await audit(req.user.id, 'Submitted application', 'application', result.insertId, req);
    res.status(201).json({ message: 'Application submitted successfully.' });
  } catch (error) { next(error); }
}

async function listApplications(req, res, next) {
  try {
    let sql;
    let params;
    if (req.user.role === 'student') {
      sql = `SELECT a.*,j.title,j.type,j.location,r.company_name,i.scheduled_at,i.mode interview_mode,i.meeting_link FROM cc_applications a JOIN cc_students s ON s.id=a.student_id JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id LEFT JOIN cc_interviews i ON i.application_id=a.id WHERE s.user_id=? ORDER BY a.updated_at DESC`;
      params = [req.user.id];
    } else if (req.user.role === 'recruiter') {
      sql = `SELECT a.*,j.title,u.full_name,s.register_number,s.cgpa,s.resume_score,s.resume_path,d.name department_name FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id JOIN cc_students s ON s.id=a.student_id JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id WHERE r.user_id=? ORDER BY a.created_at DESC`;
      params = [req.user.id];
    } else {
      sql = `SELECT a.*,j.title,j.type,u.full_name,r.company_name FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id JOIN cc_students s ON s.id=a.student_id JOIN cc_users u ON u.id=s.user_id ORDER BY a.created_at DESC`;
      params = [];
    }
    const [rows] = await pool.execute(sql, params);
    res.json({ applications: rows });
  } catch (error) { next(error); }
}

async function updateApplicationStatus(req, res, next) {
  try {
    const allowed = ['under_review','shortlisted','interview_scheduled','selected','rejected'];
    if (!allowed.includes(req.body.status)) return res.status(422).json({ message: 'Invalid application status.' });
    const guard = req.user.role === 'admin' ? '' : ' AND j.recruiter_id=(SELECT id FROM cc_recruiters WHERE user_id=?)';
    const params = req.user.role === 'admin' ? [req.body.status, req.params.id] : [req.body.status, req.params.id, req.user.id];
    const [result] = await pool.execute(`UPDATE cc_applications a JOIN cc_jobs j ON j.id=a.job_id SET a.status=?,a.status_updated_at=NOW() WHERE a.id=?${guard}`, params);
    if (!result.affectedRows) return res.status(404).json({ message: 'Application not found.' });
    await pool.execute(`INSERT INTO cc_notifications (user_id,title,message,type,link) SELECT s.user_id,'Application updated',CONCAT('Your application for ',j.title,' is now ',REPLACE(?, '_', ' '),'.'),'application','applications' FROM cc_applications a JOIN cc_students s ON s.id=a.student_id JOIN cc_jobs j ON j.id=a.job_id WHERE a.id=?`, [req.body.status, req.params.id]);
    await audit(req.user.id, `Application marked ${req.body.status}`, 'application', req.params.id, req);
    res.json({ message: 'Application status updated.' });
  } catch (error) { next(error); }
}

async function toggleSave(req, res, next) {
  try {
    const [existing] = await pool.execute('SELECT id FROM cc_saved_jobs WHERE job_id=? AND student_id=(SELECT id FROM cc_students WHERE user_id=?)', [req.params.id, req.user.id]);
    if (existing.length) {
      await pool.execute('DELETE FROM cc_saved_jobs WHERE id=?', [existing[0].id]);
      return res.json({ message: 'Removed from saved jobs.', saved: false });
    }
    await pool.execute('INSERT INTO cc_saved_jobs (job_id,student_id) VALUES (?,(SELECT id FROM cc_students WHERE user_id=?))', [req.params.id, req.user.id]);
    res.status(201).json({ message: 'Job saved.', saved: true });
  } catch (error) { next(error); }
}

async function savedJobs(req, res, next) {
  try {
    const [rows] = await pool.execute(`SELECT j.*,r.company_name FROM cc_saved_jobs sj JOIN cc_students s ON s.id=sj.student_id JOIN cc_jobs j ON j.id=sj.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id WHERE s.user_id=? ORDER BY sj.created_at DESC`, [req.user.id]);
    res.json({ jobs: rows });
  } catch (error) { next(error); }
}

async function talentPool(req, res, next) {
  try {
    const params = [];
    const conditions = ["u.status='active'"];
    if (req.query.department) { conditions.push('d.id=?'); params.push(req.query.department); }
    if (req.query.skill) { conditions.push('sk.name LIKE ?'); params.push(`%${req.query.skill}%`); }
    if (req.query.min_cgpa) { conditions.push('s.cgpa>=?'); params.push(req.query.min_cgpa); }
    const [rows] = await pool.execute(`SELECT s.id,u.full_name,s.register_number,d.name department_name,s.academic_year,s.cgpa,s.resume_score,s.ranking_score,s.resume_path,GROUP_CONCAT(DISTINCT sk.name ORDER BY sk.name SEPARATOR ', ') skills FROM cc_students s JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id LEFT JOIN cc_student_skills ss ON ss.student_id=s.id LEFT JOIN cc_skills sk ON sk.id=ss.skill_id WHERE ${conditions.join(' AND ')} GROUP BY s.id ORDER BY s.ranking_score DESC LIMIT 100`, params);
    res.json({ students: rows });
  } catch (error) { next(error); }
}

async function studentProfile(req, res, next) {
  try {
    const [rows] = await pool.execute(`SELECT s.*,u.full_name,d.name department_name,GROUP_CONCAT(DISTINCT sk.name ORDER BY sk.name SEPARATOR ', ') skills FROM cc_students s JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id LEFT JOIN cc_student_skills ss ON ss.student_id=s.id LEFT JOIN cc_skills sk ON sk.id=ss.skill_id WHERE s.id=? AND u.status='active' GROUP BY s.id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Student not found.' });
    const [projects] = await pool.execute('SELECT * FROM cc_projects WHERE student_id=?', [req.params.id]);
    const [certificates] = await pool.execute('SELECT * FROM cc_certificates WHERE student_id=?', [req.params.id]);
    res.json({ profile: rows[0], projects, certificates });
  } catch (error) { next(error); }
}

async function scheduleInterview(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const [allowed] = await connection.execute(`SELECT a.id,s.user_id,j.title FROM cc_applications a JOIN cc_jobs j ON j.id=a.job_id JOIN cc_students s ON s.id=a.student_id WHERE a.id=? AND (?='admin' OR j.recruiter_id=(SELECT id FROM cc_recruiters WHERE user_id=?))`, [req.body.application_id, req.user.role, req.user.id]);
    if (!allowed.length) return res.status(404).json({ message: 'Application not found.' });
    await connection.beginTransaction();
    const [result] = await connection.execute('INSERT INTO cc_interviews (application_id,scheduled_by,scheduled_at,duration_minutes,mode,location,meeting_link,notes) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE scheduled_by=VALUES(scheduled_by),scheduled_at=VALUES(scheduled_at),duration_minutes=VALUES(duration_minutes),mode=VALUES(mode),location=VALUES(location),meeting_link=VALUES(meeting_link),notes=VALUES(notes)', [req.body.application_id, req.user.id, req.body.scheduled_at, req.body.duration_minutes || 45, req.body.mode, req.body.location || null, req.body.meeting_link || null, req.body.notes || null]);
    await connection.execute("UPDATE cc_applications SET status='interview_scheduled',status_updated_at=NOW() WHERE id=?", [req.body.application_id]);
    await connection.execute("INSERT INTO cc_notifications (user_id,title,message,type,link) VALUES (?,'Interview scheduled',?,'interview','interviews')", [allowed[0].user_id, `Your interview for ${allowed[0].title} has been scheduled.`]);
    await connection.commit();
    res.status(201).json({ message: 'Interview scheduled and student notified.', id: result.insertId });
  } catch (error) { await connection.rollback(); next(error); } finally { connection.release(); }
}

async function listInterviews(req, res, next) {
  try {
    let guard = ''; const params = [];
    if (req.user.role === 'student') { guard = 'WHERE s.user_id=?'; params.push(req.user.id); }
    if (req.user.role === 'recruiter') { guard = 'WHERE r.user_id=?'; params.push(req.user.id); }
    const [rows] = await pool.execute(`SELECT i.*,j.title,u.full_name,r.company_name,a.status application_status FROM cc_interviews i JOIN cc_applications a ON a.id=i.application_id JOIN cc_jobs j ON j.id=a.job_id JOIN cc_recruiters r ON r.id=j.recruiter_id JOIN cc_students s ON s.id=a.student_id JOIN cc_users u ON u.id=s.user_id ${guard} ORDER BY i.scheduled_at`, params);
    res.json({ interviews: rows });
  } catch (error) { next(error); }
}

async function notifications(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM cc_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json({ notifications: rows });
  } catch (error) { next(error); }
}

async function readNotification(req, res, next) {
  try {
    await pool.execute('UPDATE cc_notifications SET is_read=1 WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (error) { next(error); }
}

async function rankings(req, res, next) {
  try {
    const conditions = ["u.status='active'"]; const params = [];
    if (req.query.department_id) { conditions.push('s.department_id=?'); params.push(req.query.department_id); }
    const [rows] = await pool.execute(`SELECT s.id,u.full_name,d.name department_name,s.cgpa,s.resume_score,s.ranking_score,(SELECT COUNT(*) FROM cc_student_skills WHERE student_id=s.id) skills_count,(SELECT COUNT(*) FROM cc_certificates WHERE student_id=s.id) certificates_count FROM cc_students s JOIN cc_users u ON u.id=s.user_id LEFT JOIN cc_departments d ON d.id=s.department_id WHERE ${conditions.join(' AND ')} ORDER BY s.ranking_score DESC,u.full_name LIMIT 100`, params);
    res.json({ rankings: rows.map((row, index) => ({ ...row, rank: index + 1 })) });
  } catch (error) { next(error); }
}

async function announcements(req, res, next) {
  try {
    const [rows] = await pool.query("SELECT a.*,u.full_name author FROM cc_announcements a JOIN cc_users u ON u.id=a.author_id WHERE a.is_published=1 AND (a.expires_at IS NULL OR a.expires_at>NOW()) ORDER BY a.is_pinned DESC,a.published_at DESC");
    res.json({ announcements: rows });
  } catch (error) { next(error); }
}

module.exports = { listJobs, myJobs, createJob, updateJob, deleteJob, apply, listApplications, updateApplicationStatus, toggleSave, savedJobs, talentPool, studentProfile, scheduleInterview, listInterviews, notifications, readNotification, rankings, announcements };
