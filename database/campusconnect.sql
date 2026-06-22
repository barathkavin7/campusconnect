USE intern3_db;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS cc_departments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(20) NOT NULL,
  hod_name VARCHAR(120) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_departments_name (name),
  UNIQUE KEY uq_cc_departments_code (code),
  KEY idx_cc_departments_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','recruiter','admin') NOT NULL,
  status ENUM('pending','active','rejected','suspended') NOT NULL DEFAULT 'pending',
  avatar_path VARCHAR(500) NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_cc_users_email (email),
  KEY idx_cc_users_role_status (role,status),
  KEY idx_cc_users_created (created_at),
  CONSTRAINT fk_cc_users_approved_by FOREIGN KEY (approved_by) REFERENCES cc_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_students (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  register_number VARCHAR(60) NOT NULL,
  department_id BIGINT UNSIGNED NOT NULL,
  academic_year TINYINT UNSIGNED NOT NULL,
  cgpa DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  bio TEXT NULL,
  linkedin_url VARCHAR(500) NULL,
  github_url VARCHAR(500) NULL,
  portfolio_url VARCHAR(500) NULL,
  resume_path VARCHAR(500) NULL,
  resume_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ranking_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_students_user (user_id),
  UNIQUE KEY uq_cc_students_register (register_number),
  KEY idx_cc_students_department_year (department_id,academic_year),
  KEY idx_cc_students_ranking (ranking_score),
  KEY idx_cc_students_cgpa (cgpa),
  CONSTRAINT fk_cc_students_user FOREIGN KEY (user_id) REFERENCES cc_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_students_department FOREIGN KEY (department_id) REFERENCES cc_departments(id) ON DELETE RESTRICT,
  CONSTRAINT chk_cc_students_year CHECK (academic_year BETWEEN 1 AND 6),
  CONSTRAINT chk_cc_students_cgpa CHECK (cgpa BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_recruiters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  company_name VARCHAR(180) NOT NULL,
  industry VARCHAR(120) NOT NULL,
  website VARCHAR(500) NULL,
  description TEXT NULL,
  headquarters VARCHAR(180) NULL,
  company_size VARCHAR(60) NULL,
  logo_path VARCHAR(500) NULL,
  verification_document VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_recruiters_user (user_id),
  KEY idx_cc_recruiters_company (company_name),
  KEY idx_cc_recruiters_industry (industry),
  CONSTRAINT fk_cc_recruiters_user FOREIGN KEY (user_id) REFERENCES cc_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_skills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_skills_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_student_skills (
  student_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  proficiency ENUM('beginner','intermediate','advanced','expert') NOT NULL DEFAULT 'intermediate',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id,skill_id),
  KEY idx_cc_student_skills_skill (skill_id),
  CONSTRAINT fk_cc_student_skills_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_student_skills_skill FOREIGN KEY (skill_id) REFERENCES cc_skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_projects (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  technologies VARCHAR(500) NULL,
  project_url VARCHAR(500) NULL,
  github_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cc_projects_student (student_id),
  CONSTRAINT fk_cc_projects_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_certificates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  issuer VARCHAR(180) NULL,
  issued_on DATE NULL,
  file_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_certificates_student (student_id),
  KEY idx_cc_certificates_issued (issued_on),
  CONSTRAINT fk_cc_certificates_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recruiter_id BIGINT UNSIGNED NOT NULL,
  type ENUM('internship','placement') NOT NULL,
  title VARCHAR(180) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  location VARCHAR(180) NULL,
  work_mode ENUM('onsite','hybrid','remote') NOT NULL DEFAULT 'onsite',
  duration VARCHAR(80) NULL,
  stipend DECIMAL(12,2) NULL,
  package_lpa DECIMAL(8,2) NULL,
  openings INT UNSIGNED NOT NULL DEFAULT 1,
  eligibility_cgpa DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  eligible_departments VARCHAR(500) NULL,
  skills_required VARCHAR(800) NULL,
  application_deadline DATE NOT NULL,
  status ENUM('draft','published','closed','archived') NOT NULL DEFAULT 'draft',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cc_jobs_recruiter (recruiter_id),
  KEY idx_cc_jobs_type_status (type,status),
  KEY idx_cc_jobs_deadline (application_deadline),
  KEY idx_cc_jobs_location (location),
  FULLTEXT KEY ftx_cc_jobs_search (title,description,skills_required),
  CONSTRAINT fk_cc_jobs_recruiter FOREIGN KEY (recruiter_id) REFERENCES cc_recruiters(id) ON DELETE RESTRICT,
  CONSTRAINT chk_cc_jobs_cgpa CHECK (eligibility_cgpa BETWEEN 0 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_saved_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_saved_jobs_student_job (student_id,job_id),
  KEY idx_cc_saved_jobs_job (job_id),
  CONSTRAINT fk_cc_saved_jobs_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_saved_jobs_job FOREIGN KEY (job_id) REFERENCES cc_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  status ENUM('applied','under_review','shortlisted','interview_scheduled','selected','rejected','withdrawn') NOT NULL DEFAULT 'applied',
  cover_letter TEXT NULL,
  recruiter_notes TEXT NULL,
  status_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_applications_job_student (job_id,student_id),
  KEY idx_cc_applications_student_status (student_id,status),
  KEY idx_cc_applications_job_status (job_id,status),
  KEY idx_cc_applications_created (created_at),
  CONSTRAINT fk_cc_applications_job FOREIGN KEY (job_id) REFERENCES cc_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cc_applications_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_interviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id BIGINT UNSIGNED NOT NULL,
  scheduled_by BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  mode ENUM('online','onsite','phone') NOT NULL,
  location VARCHAR(300) NULL,
  meeting_link VARCHAR(500) NULL,
  notes TEXT NULL,
  result ENUM('pending','passed','failed','rescheduled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cc_interviews_application (application_id),
  KEY idx_cc_interviews_schedule (scheduled_at),
  KEY idx_cc_interviews_scheduler (scheduled_by),
  CONSTRAINT fk_cc_interviews_application FOREIGN KEY (application_id) REFERENCES cc_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_interviews_scheduler FOREIGN KEY (scheduled_by) REFERENCES cc_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('general','application','interview','approval','announcement','message') NOT NULL DEFAULT 'general',
  link VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_notifications_user_read (user_id,is_read,created_at),
  CONSTRAINT fk_cc_notifications_user FOREIGN KEY (user_id) REFERENCES cc_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  audience ENUM('all','student','recruiter') NOT NULL DEFAULT 'all',
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cc_announcements_active (is_published,published_at,expires_at),
  CONSTRAINT fk_cc_announcements_author FOREIGN KEY (author_id) REFERENCES cc_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  recruiter_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cc_conversations_student (student_id,updated_at),
  KEY idx_cc_conversations_recruiter (recruiter_id,updated_at),
  KEY idx_cc_conversations_job (job_id),
  CONSTRAINT fk_cc_conversations_student FOREIGN KEY (student_id) REFERENCES cc_students(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_conversations_recruiter FOREIGN KEY (recruiter_id) REFERENCES cc_recruiters(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_conversations_job FOREIGN KEY (job_id) REFERENCES cc_jobs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_messages_conversation (conversation_id,created_at),
  KEY idx_cc_messages_unread (conversation_id,read_at),
  KEY idx_cc_messages_sender (sender_id),
  CONSTRAINT fk_cc_messages_conversation FOREIGN KEY (conversation_id) REFERENCES cc_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_messages_sender FOREIGN KEY (sender_id) REFERENCES cc_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(200) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT UNSIGNED NULL,
  ip_address VARCHAR(64) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_activity_logs_user (user_id,created_at),
  KEY idx_cc_activity_logs_entity (entity_type,entity_id),
  KEY idx_cc_activity_logs_created (created_at),
  CONSTRAINT fk_cc_activity_logs_user FOREIGN KEY (user_id) REFERENCES cc_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new','in_progress','resolved') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cc_contact_messages_status (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cc_departments (name,code,hod_name) VALUES
  ('Computer Science and Engineering','CSE','Dr. Ananya Rao'),
  ('Information Technology','IT','Dr. Vikram Shah'),
  ('Electronics and Communication Engineering','ECE','Dr. Meera Iyer'),
  ('Electrical and Electronics Engineering','EEE','Dr. Karthik Nair'),
  ('Mechanical Engineering','MECH','Dr. Rahul Menon'),
  ('Civil Engineering','CIVIL','Dr. Priya Desai'),
  ('Artificial Intelligence and Data Science','AIDS','Dr. Neha Kulkarni')
ON DUPLICATE KEY UPDATE name=VALUES(name),hod_name=VALUES(hod_name);

INSERT INTO cc_skills (name) VALUES
  ('JavaScript'),('Node.js'),('Express.js'),('MySQL'),('HTML'),('CSS'),('Java'),('Python'),
  ('C++'),('SQL'),('Git'),('REST APIs'),('Data Structures'),('Machine Learning'),('Cloud Computing')
ON DUPLICATE KEY UPDATE name=VALUES(name);

SET FOREIGN_KEY_CHECKS=1;
