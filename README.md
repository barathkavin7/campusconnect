# CampusConnect

CampusConnect is a production-ready Internship & Placement Management Portal for colleges. It brings students, recruiters, and placement officers into one full-stack system for registration approvals, profile building, internship and placement drives, applications, interviews, rankings, reports, notifications, and real-time chat.

The implementation uses the requested stack only:

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js and Express.js
- Database: MySQL
- Authentication: JWT and bcryptjs
- Real-time communication: Socket.IO
- Deployment target: Ubuntu server with PM2

The application uses the existing MySQL database `intern3_db`. All CampusConnect tables are prefixed with `cc_`.

## Features

### Public landing page

- Dark SaaS-style landing page with glassmorphism
- Hero section, statistics, features, recruiter showcase, success stories, FAQ, and contact section
- Login and registration entry points for students and recruiters

### Student portal

- Student registration with pending approval workflow
- Profile management for name, register number, department, year, CGPA, skills, projects, certifications, and portfolio links
- PDF resume upload and certificate upload
- Browse internships and placement drives
- Apply for opportunities and save jobs
- Track application workflow: Applied, Under Review, Shortlisted, Interview Scheduled, Selected, Rejected
- View interview schedule, notifications, resume score, and rankings
- Real-time chat with recruiters

### Recruiter portal

- Recruiter registration with company verification document upload
- Company profile management and company logo upload
- Create internships and placement drives
- Manage job posts, applicants, shortlists, rejections, and interviews
- Search talent pool and view student profiles
- Download protected student resumes
- Send notifications and chat with students in real time

### Placement officer/admin portal

- Approve or reject students and recruiters
- Manage users, jobs, drives, applications, interviews, notifications, announcements, departments, rankings, and activity logs
- Monitor chat records
- View analytics for students, recruiters, jobs, applications, eligible students, placed students, placement percentage, highest package, and average package
- Download student, recruiter, and placement CSV reports

## Scoring and ranking

Resume score is calculated out of 100 using:

- Skills
- Projects
- Certificates
- CGPA
- GitHub link
- LinkedIn link
- Resume upload status

Ranking score uses:

- CGPA: 40%
- Resume score: 35%
- Skills count: 15%
- Certificates: 10%

## Project structure

```text
campusconnect/
  backend/
    config/
      db.js
    controllers/
    middleware/
    routes/
    scripts/
      create-admin.js
    utils/
      scoring.js
    package.json
    server.js
    socket.js
  database/
    campusconnect.sql
  frontend/
    assets/
      app.js
      styles.css
    index.html
  uploads/
    resumes/
    certificates/
    company_docs/
    logos/
  .env.example
  ecosystem.config.cjs
  README.md
```

## Installation

Install prerequisites on Ubuntu:

```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server
sudo npm install -g pm2
```

Use Node.js 20 or newer. If the Ubuntu package repository provides an older Node version, install Node.js 20+ from NodeSource or your approved server package source.

Install backend dependencies:

```bash
cd campusconnect/backend
npm install --production
```

For local development with nodemon:

```bash
cd campusconnect/backend
npm install
npm run dev
```

## Environment variables

Create the production environment file:

```bash
cp campusconnect/.env.example campusconnect/.env
```

Configure these values:

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes | Use `production` on the server |
| `PORT` | Yes | App port, usually `3000` behind Nginx |
| `APP_URL` | Yes | Public app URL |
| `FRONTEND_ORIGIN` | Yes | Allowed browser origin for CORS and Socket.IO |
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | Yes | MySQL port |
| `DB_USER` | Yes | MySQL user for `intern3_db` |
| `DB_PASSWORD` | Yes | MySQL password |
| `DB_NAME` | Yes | Must be `intern3_db` |
| `DB_CONNECTION_LIMIT` | No | MySQL pool size, default `10` |
| `JWT_SECRET` | Yes | At least 32 characters; use a long random secret |
| `JWT_EXPIRES_IN` | No | Token lifetime, default-style value such as `8h` |
| `MAX_UPLOAD_MB` | No | Upload size limit, default handled by the app |

Generate a strong JWT secret:

```bash
openssl rand -base64 48
```

## Database setup

CampusConnect must use the existing database:

```sql
intern3_db
```

Do not create another database for this project.

Import the schema and lookup seed data:

```bash
mysql -u YOUR_MYSQL_USER -p intern3_db < campusconnect/database/campusconnect.sql
```

The SQL file creates all required `cc_` tables, indexes, foreign keys, departments, and skills. It does not create a hardcoded default admin account.

## Secure admin bootstrap

After importing the database schema, create the initial placement officer/admin account with the bootstrap script.

Option 1: provide a strong password yourself:

```bash
cd campusconnect/backend
ADMIN_EMAIL=admin@example.edu ADMIN_PASSWORD='use-a-long-unique-password' npm run create-admin
```

Option 2: let the script generate a strong one-time password:

```bash
cd campusconnect/backend
ADMIN_EMAIL=admin@example.edu ADMIN_GENERATE_PASSWORD=true npm run create-admin
```

The script:

- Requires `ADMIN_EMAIL`
- Requires either `ADMIN_PASSWORD` or `ADMIN_GENERATE_PASSWORD=true`
- Enforces a minimum admin password length of 14 characters
- Uses bcryptjs with 12 salt rounds
- Creates or updates the admin user as `active`
- Writes an audit entry to `cc_activity_logs`

If the script generates a password, copy it immediately into a password manager. It is printed once and is never stored in plaintext.

## Running the application

Start the app directly:

```bash
cd campusconnect/backend
npm start
```

The Express server serves:

- Frontend: `campusconnect/frontend`
- API: `/api`
- Socket.IO: `/socket.io`
- Protected uploads: `/uploads/:category/:filename`

Useful health checks:

```bash
curl http://127.0.0.1:3000/api/public/overview
curl http://127.0.0.1:3000/api/public/jobs
```

## PM2 deployment

Create required runtime directories:

```bash
mkdir -p campusconnect/backend/logs
mkdir -p campusconnect/uploads/resumes campusconnect/uploads/certificates campusconnect/uploads/company_docs campusconnect/uploads/logos
chmod -R 750 campusconnect/uploads
```

Start with PM2 from the project root:

```bash
cd campusconnect
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Common PM2 commands:

```bash
pm2 status
pm2 logs campusconnect
pm2 restart campusconnect
pm2 stop campusconnect
```

The PM2 config runs the app in cluster mode with `instances: "max"`. That is compatible with the HTTP app. For Socket.IO chat in a multi-instance production deployment, use sticky sessions at the proxy/load-balancer layer or add a Socket.IO adapter such as Redis for cross-process room broadcasts. Single-instance PM2 deployment does not require an adapter.

To run one instance instead, edit `ecosystem.config.cjs`:

```js
instances: 1,
exec_mode: 'fork'
```

## Socket.IO setup

The frontend loads the Socket.IO browser client from the same server:

```html
<script src="/socket.io/socket.io.js"></script>
```

The frontend sends the JWT during the Socket.IO handshake:

```js
io({ auth: { token } });
```

The backend verifies the token, checks that the user is active, joins the user room, validates conversation access, and stores messages in `cc_messages`.

If using Nginx, include WebSocket upgrade headers:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Also confirm `FRONTEND_ORIGIN` exactly matches the browser origin, including protocol and hostname.

## API route overview

Authentication:

- `POST /api/auth/register/student`
- `POST /api/auth/register/recruiter`
- `POST /api/auth/login`
- `GET /api/auth/me`

Public:

- `GET /api/public/overview`
- `POST /api/public/contact`
- `GET /api/public/jobs`
- `GET /api/public/announcements`

Portal:

- `GET /api/dashboard`
- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/jobs`
- `GET /api/applications`
- `GET /api/interviews`
- `GET /api/notifications`
- `GET /api/rankings`
- `GET /api/announcements`

Student:

- `POST /api/student/resume`
- `POST /api/student/certificates`
- `POST /api/student/skills`
- `DELETE /api/student/skills/:id`
- `POST /api/student/projects`
- `DELETE /api/student/projects/:id`
- `POST /api/jobs/:id/apply`
- `POST /api/jobs/:id/save`
- `GET /api/student/saved-jobs`

Recruiter:

- `POST /api/recruiter/logo`
- `GET /api/recruiter/jobs`
- `POST /api/recruiter/jobs`
- `PUT /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `PATCH /api/applications/:id/status`
- `GET /api/talent`
- `GET /api/talent/:id`
- `POST /api/interviews`

Admin:

- `GET /api/admin/approvals`
- `PATCH /api/admin/approvals/:id`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/departments`
- `PUT /api/admin/departments/:id`
- `POST /api/admin/announcements`
- `GET /api/admin/activity-logs`
- `GET /api/admin/reports/:type`

Protected routes require:

```http
Authorization: Bearer <jwt>
```

## File storage

Files are stored on disk and paths are stored in MySQL.

- Resumes: `uploads/resumes/`
- Certificates: `uploads/certificates/`
- Company verification documents: `uploads/company_docs/`
- Company logos: `uploads/logos/`

Do not store uploaded files as BLOBs.

## Verification checklist

Before going live:

```bash
cd campusconnect/backend
npm run check
npm run create-admin
npm start
```

Then verify in the browser:

- Landing page loads from `APP_URL`
- Student registration creates a pending student account
- Recruiter registration uploads a company verification document and creates a pending recruiter account
- Admin login works with the bootstrapped account
- Admin approval activates users
- Protected API requests include `Authorization: Bearer <jwt>`
- Resume upload accepts PDF files only
- Certificate and company document uploads write files to the `uploads/` directories
- Student and recruiter chat connects over Socket.IO
- Chat messages are saved in `cc_messages`
- Admin CSV reports download correctly

## Troubleshooting

### App exits with `Missing required environment variable`

Create `campusconnect/.env` and verify that all required variables from `.env.example` are set.

### App exits with `JWT_SECRET must contain at least 32 characters`

Replace `JWT_SECRET` with a long random value:

```bash
openssl rand -base64 48
```

### MySQL connection fails

Check:

- MySQL is running
- `DB_HOST` and `DB_PORT` are reachable from the Node.js server
- `DB_USER` and `DB_PASSWORD` are correct
- `DB_NAME` is `intern3_db`
- `database/campusconnect.sql` has been imported
- The MySQL user has read/write permissions on all `cc_` tables

### Admin bootstrap fails

Make sure the schema has been imported first. Then rerun with either:

```bash
ADMIN_EMAIL=admin@example.edu ADMIN_PASSWORD='use-a-long-unique-password' npm run create-admin
```

or:

```bash
ADMIN_EMAIL=admin@example.edu ADMIN_GENERATE_PASSWORD=true npm run create-admin
```

### Login returns `Account is not active yet`

Student and recruiter accounts are intentionally created as `pending`. Log in as an admin and approve the account.

### Uploads fail

Check directory permissions:

```bash
ls -ld campusconnect/uploads campusconnect/uploads/*
```

The user running PM2 must have write access.

### Socket.IO fails behind Nginx

Confirm the Nginx location block includes `Upgrade` and `Connection` headers, and that `FRONTEND_ORIGIN` matches the browser origin.

### PM2 starts but log files are missing

Create the log directory:

```bash
mkdir -p campusconnect/backend/logs
pm2 restart campusconnect
```
