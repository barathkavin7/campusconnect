'use strict';

const state = {
  token: localStorage.getItem('cc_token'),
  user: JSON.parse(localStorage.getItem('cc_user') || 'null'),
  currentPage: 'dashboard',
  socket: null,
  conversationId: null,
  departments: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const initials = (name = 'Campus Connect') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const titleCase = (value = '') => String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = (value, includeTime = false) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) : '—';
const relativeTime = (value) => {
  if (!value) return '';
  const seconds = Math.round((new Date(value) - new Date()) / 1000);
  const ranges = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, unit] of ranges) if (Math.abs(seconds) >= size) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / size), unit);
  return 'just now';
};
const money = (value, suffix = '') => value === null || value === undefined ? '—' : `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 })}${suffix}`;

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, { ...options, headers, body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(result.message || 'The request could not be completed.');
  }
  return result;
}

function toast(message, type = 'success', title = type === 'success' ? 'Done' : 'Something went wrong') {
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `<i>${type === 'success' ? '✓' : '!'}</i><div><b>${escapeHtml(title)}</b><span>${escapeHtml(message)}</span></div>`;
  $('#toast-stack').append(element);
  setTimeout(() => element.remove(), 4300);
}

function setBusy(button, busy, text = 'Working…') {
  if (!button) return;
  if (busy) { button.dataset.original = button.innerHTML; button.innerHTML = text; button.disabled = true; }
  else { button.innerHTML = button.dataset.original || button.innerHTML; button.disabled = false; }
}

function openModal(content) {
  $('#modal-content').innerHTML = content;
  $('#action-modal').classList.remove('hidden');
}
function closeModals() { $$('.modal-backdrop').forEach((modal) => modal.classList.add('hidden')); }

async function loadPublicOverview() {
  try {
    const data = await api('/public/overview');
    state.departments = data.departments;
    const statValues = { students: `${data.stats.students || 0}+`, recruiters: `${data.stats.recruiters || 0}+`, opportunities: `${data.stats.opportunities || 0}+`, placements: `${data.stats.placements || 0}+` };
    Object.entries(statValues).forEach(([key, value]) => { const node = $(`[data-stat="${key}"]`); if (node) node.textContent = value; });
    if (data.companies.length) $('#company-showcase').innerHTML = data.companies.map((company) => `<div title="${escapeHtml(company.industry)}">${escapeHtml(company.company_name)}</div>`).join('');
    fillDepartmentSelects();
  } catch (error) { console.warn(error.message); }
}

function fillDepartmentSelects() {
  $$('.department-select').forEach((select) => {
    select.innerHTML = '<option value="">Choose department</option>' + state.departments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join('');
  });
}

function showAuth(tab = 'login') {
  $('#auth-modal').classList.remove('hidden');
  switchAuthTab(tab === 'register' ? 'student' : tab);
}

function switchAuthTab(tab) {
  $$('[data-auth-tab]').forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
  ['login', 'student', 'recruiter'].forEach((name) => $(`#${name}-form`).classList.toggle('hidden', name !== tab));
}

async function handleAuthForm(event, endpoint) {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget);
  setBusy(button, true);
  try {
    const formData = new FormData(event.currentTarget);
    const isMultipart = endpoint.includes('recruiter');
    const body = isMultipart ? formData : Object.fromEntries(formData);
    const result = await api(endpoint, { method: 'POST', body });
    if (result.token) {
      state.token = result.token; state.user = result.user;
      localStorage.setItem('cc_token', state.token); localStorage.setItem('cc_user', JSON.stringify(state.user));
      closeModals(); await startPortal(); toast(`Welcome back, ${state.user.full_name.split(' ')[0]}.`);
    } else {
      toast(result.message); event.currentTarget.reset(); switchAuthTab('login');
    }
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

function logout(showMessage = true) {
  if (state.socket) state.socket.disconnect();
  state.token = null; state.user = null; state.socket = null;
  localStorage.removeItem('cc_token'); localStorage.removeItem('cc_user');
  $('#portal-view').classList.add('hidden'); $('#landing-view').classList.remove('hidden');
  if (showMessage) toast('You have been signed out.');
}

const navigation = {
  student: [
    ['dashboard', '⌂', 'Overview'], ['opportunities', '⌕', 'Opportunities'], ['applications', '◫', 'Applications'], ['saved', '◇', 'Saved jobs'],
    ['interviews', '◷', 'Interviews'], ['chat', '◌', 'Messages'], ['rankings', '♕', 'Leaderboard'], ['profile', '◎', 'My profile'], ['notifications', '♢', 'Notifications'], ['announcements', '◈', 'Announcements']
  ],
  recruiter: [
    ['dashboard', '⌂', 'Overview'], ['jobs', '▣', 'Job posts'], ['applications', '◫', 'Applicants'], ['talent', '⌕', 'Talent pool'],
    ['interviews', '◷', 'Interviews'], ['chat', '◌', 'Messages'], ['profile', '◎', 'Company profile'], ['notifications', '♢', 'Notifications'], ['announcements', '◈', 'Announcements']
  ],
  admin: [
    ['dashboard', '⌂', 'Command center'], ['approvals', '✓', 'Approvals'], ['users', '◎', 'Users'], ['opportunities', '▣', 'Jobs & drives'],
    ['applications', '◫', 'Applications'], ['interviews', '◷', 'Interviews'], ['announcements', '◈', 'Announcements'], ['departments', '⌘', 'Departments'],
    ['rankings', '♕', 'Rankings'], ['reports', '↧', 'Reports'], ['activity', '↻', 'Activity logs'], ['chat', '◌', 'Chat monitor'], ['notifications', '♢', 'Notifications']
  ]
};

async function startPortal() {
  $('#landing-view').classList.add('hidden'); $('#portal-view').classList.remove('hidden');
  try {
    const session = await api('/auth/me');
    state.user = { ...state.user, ...session.user };
    localStorage.setItem('cc_user', JSON.stringify(state.user));
    const avatar = initials(state.user.full_name);
    $('#user-chip').innerHTML = `<span class="avatar">${avatar}</span><div><b>${escapeHtml(state.user.full_name)}</b><small>${titleCase(state.user.role)}</small></div>`;
    $('#top-avatar').textContent = avatar;
    $('#side-nav').innerHTML = navigation[state.user.role].map(([page, icon, label]) => `<button class="nav-item" data-page="${page}"><span class="nav-icon">${icon}</span>${label}</button>`).join('');
    connectSocket();
    await navigate('dashboard');
    refreshUnread();
  } catch (error) { logout(false); toast(error.message, 'error'); }
}

function connectSocket() {
  if (typeof io === 'undefined') return;
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('connect_error', () => console.warn('Real-time connection is currently unavailable.'));
  state.socket.on('message:new', (message) => {
    if (Number(message.conversation_id) === Number(state.conversationId)) appendMessage(message);
    else toast(`${message.sender_name}: ${message.body.slice(0, 80)}`, 'success', 'New message');
  });
}

async function navigate(page) {
  state.currentPage = page;
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  const navItem = navigation[state.user.role].find(([key]) => key === page);
  $('#page-crumb').textContent = navItem ? navItem[2] : titleCase(page);
  $('#page-content').innerHTML = '<div class="loading-state"><div class="loader"></div><p>Loading your workspace…</p></div>';
  $('#sidebar').classList.remove('open');
  const renders = { dashboard: renderDashboard, opportunities: renderOpportunities, jobs: renderJobs, applications: renderApplications, saved: renderSaved, interviews: renderInterviews, chat: renderChat, rankings: renderRankings, profile: renderProfile, notifications: renderNotifications, announcements: renderAnnouncements, talent: renderTalent, approvals: renderApprovals, users: renderUsers, departments: renderDepartments, reports: renderReports, activity: renderActivity };
  try { await (renders[page] || renderDashboard)(); }
  catch (error) { $('#page-content').innerHTML = emptyState('!', 'Could not load this page', error.message); }
}

function pageHeader(kicker, title, description, actions = '') {
  return `<div class="page-header"><div class="page-title"><small>${escapeHtml(kicker)}</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function emptyState(icon, title, description, action = '') { return `<div class="empty-state"><span>${icon}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div>`; }
function statusPill(status) { return `<span class="status-pill ${escapeHtml(status)}">${titleCase(status)}</span>`; }
function metric(label, value, icon, foot, accent = '#8b5cf6') { return `<article class="metric-card" style="--accent:${accent}"><div class="metric-top"><span>${escapeHtml(label)}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${value ?? 0}</div><div class="metric-foot">${escapeHtml(foot || 'Live campus data')}</div></article>`; }
function chart(data = []) {
  if (!data.length) return emptyState('⌁', 'No trend data yet', 'Chart data will appear as applications arrive.');
  const max = Math.max(...data.map((item) => Number(item.value)), 1);
  return `<div class="chart-wrap">${data.map((item) => `<div class="chart-column" style="--height:${Math.max(4, Number(item.value) / max * 90)}%"><span>${item.value}</span><i class="chart-bar"></i><label>${escapeHtml(item.label)}</label></div>`).join('')}</div><div></div>`;
}
function activityList(items = []) {
  return items.length ? `<div class="activity-list">${items.map((item) => `<div class="activity-item"><span class="activity-dot">${item.status ? '◫' : '↻'}</span><div><b>${escapeHtml(item.full_name || item.title || 'CampusConnect')}</b><span>${escapeHtml(item.action || `${titleCase(item.status)} · ${item.company_name || ''}`)}</span><time>${relativeTime(item.created_at || item.updated_at)}</time></div></div>`).join('')}</div>` : emptyState('↻', 'Nothing here yet', 'New activity will appear here.');
}

async function renderDashboard() {
  const data = await api('/dashboard');
  const first = state.user.full_name.split(' ')[0];
  let metricsHtml; let content;
  if (state.user.role === 'admin') {
    const m = data.metrics;
    metricsHtml = [metric('Total students', m.total_students, '◎', `${m.eligible_students} eligible`, '#8b5cf6'), metric('Hiring partners', m.total_recruiters, '◇', 'Verified recruiters', '#22d3ee'), metric('Active jobs', m.total_jobs, '▣', `${m.total_applications} applications`, '#34d399'), metric('Placement rate', `${m.placement_percentage}%`, '↗', `Highest ₹${money(m.highest_package, ' LPA')}`, '#fbbf24')].join('');
    content = `<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Application momentum</h2><p>Six-month activity across campus</p></div></div>${chart(data.charts.trend)}</section><section class="panel"><div class="panel-header"><div><h2>Recent activity</h2><p>Latest audited actions</p></div><button data-page="activity">View all</button></div>${activityList(data.recent)}</section></div>`;
  } else if (state.user.role === 'recruiter') {
    const m = data.metrics || {};
    metricsHtml = [metric('Total posts', m.total_jobs, '▣', 'All opportunities'), metric('Active posts', m.active_jobs, '↗', 'Currently accepting'), metric('Applicants', m.total_applicants, '◎', 'Across all roles', '#22d3ee'), metric('Shortlisted', m.shortlisted, '✓', 'Strong candidates', '#34d399')].join('');
    content = `<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Latest applicants</h2><p>Recently submitted applications</p></div><button data-page="applications">View pipeline</button></div>${activityList(data.recent)}</section><section class="panel"><div class="panel-header"><div><h2>Recruiting shortcuts</h2><p>Keep the pipeline moving</p></div></div><div class="card-actions"><button class="btn primary" data-action="new-job">Post opportunity</button><button class="btn glass" data-page="talent">Search talent</button></div></section></div>`;
  } else {
    const m = data.metrics || {};
    metricsHtml = [metric('Resume score', `${m.resume_score || 0}/100`, '⌁', 'Profile strength'), metric('Overall rank', `#${m.overall_rank || '—'}`, '♕', `${Number(m.ranking_score || 0).toFixed(1)} ranking points`, '#fbbf24'), metric('Applications', m.applications, '◫', `${m.shortlisted || 0} shortlisted`, '#22d3ee'), metric('Saved roles', m.saved_jobs, '◇', 'Review your shortlist', '#34d399')].join('');
    const recommendations = data.recommended?.length ? `<div class="card-grid">${data.recommended.slice(0, 3).map(jobCard).join('')}</div>` : emptyState('⌕', 'No recommendations yet', 'New opportunities will appear here.');
    content = `<div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2>Application activity</h2><p>Your latest status updates</p></div><button data-page="applications">Track all</button></div>${activityList(data.recent)}</section><section class="panel"><div class="panel-header"><div><h2>Readiness</h2><p>Your composite placement score</p></div></div><div class="score-progress"><div><span>Profile strength</span><b>${m.resume_score || 0}%</b></div><div class="progress"><i style="width:${m.resume_score || 0}%"></i></div></div></section></div><section style="margin-top:14px"><div class="panel-header"><div><h2>Recommended for you</h2><p>Fresh roles accepting applications</p></div><button data-page="opportunities">Explore all</button></div>${recommendations}</section>`;
  }
  $('#page-content').innerHTML = pageHeader('Workspace overview', `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${first}`, state.user.role === 'admin' ? 'Your campus placement command center.' : 'Here is what deserves your attention today.') + `<div class="metrics-grid">${metricsHtml}</div>${content}`;
}

function jobCard(job, recruiterView = false) {
  const skills = String(job.skills_required || '').split(',').filter(Boolean).slice(0, 3);
  const compensation = job.type === 'placement' ? `₹${money(job.package_lpa, ' LPA')}` : job.stipend ? `₹${money(job.stipend)}/mo` : 'Unpaid';
  let actions = '';
  if (state.user.role === 'student') actions = `<button class="btn primary small" data-action="apply" data-id="${job.id}">Apply now</button><button class="btn glass small" data-action="save" data-id="${job.id}">Save</button>`;
  if (recruiterView) actions = `<button class="btn glass small" data-action="edit-job" data-id="${job.id}">Edit</button><button class="btn danger small" data-action="close-job" data-id="${job.id}">Close</button>`;
  if (state.user.role === 'admin') actions = `<button class="btn danger small" data-action="close-job" data-id="${job.id}">Close posting</button>`;
  return `<article class="data-card opportunity-card"><div class="company-row"><span class="company-logo">${escapeHtml((job.company_name || state.user.full_name)[0])}</span><div><b>${escapeHtml(job.company_name || 'Your company')}</b><small>${titleCase(job.type)} · ${escapeHtml(job.work_mode || 'onsite')}</small></div></div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.description)}</p><div class="tag-row">${skills.map((skill) => `<span class="tag">${escapeHtml(skill.trim())}</span>`).join('')}<span class="tag">CGPA ${job.eligibility_cgpa || 0}+</span></div><div class="opportunity-meta"><span>⌖ ${escapeHtml(job.location || 'Flexible')}</span><b>${compensation}</b><span>Due ${formatDate(job.application_deadline)}</span></div><div class="card-actions">${actions}</div></article>`;
}

async function renderOpportunities() {
  const data = await api('/jobs');
  $('#page-content').innerHTML = pageHeader('Discover', state.user.role === 'admin' ? 'Jobs & placement drives' : 'Find your next opportunity', state.user.role === 'student' ? 'Verified internships and placement drives, all in one place.' : 'Monitor published opportunities across campus.') + `<div class="filters"><input id="job-search" placeholder="Search roles, companies or skills"><select id="job-type"><option value="">All opportunities</option><option value="internship">Internships</option><option value="placement">Placement drives</option></select><select id="job-mode"><option value="">Any work mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></div><div class="card-grid" id="jobs-grid">${data.jobs.length ? data.jobs.map(jobCard).join('') : emptyState('⌕', 'No open opportunities', 'Check back when recruiters publish new roles.')}</div>`;
  const filter = () => {
    const query = $('#job-search').value.toLowerCase(); const type = $('#job-type').value; const mode = $('#job-mode').value;
    const jobs = data.jobs.filter((job) => (!query || `${job.title} ${job.company_name} ${job.skills_required}`.toLowerCase().includes(query)) && (!type || job.type === type) && (!mode || job.work_mode === mode));
    $('#jobs-grid').innerHTML = jobs.length ? jobs.map(jobCard).join('') : emptyState('⌕', 'No matching roles', 'Try changing your filters.');
  };
  $('#job-search').addEventListener('input', filter); $('#job-type').addEventListener('change', filter); $('#job-mode').addEventListener('change', filter);
}

async function renderJobs() {
  const data = await api('/recruiter/jobs');
  $('#page-content').innerHTML = pageHeader('Recruiting', 'Manage job posts', 'Create internships and placement drives, then watch the pipeline grow.', '<button class="btn primary" data-action="new-job">+ New opportunity</button>') + `<div class="card-grid">${data.jobs.length ? data.jobs.map((job) => jobCard(job, true)).join('') : emptyState('▣', 'Publish your first opportunity', 'A clear, detailed post attracts stronger candidates.', '<button class="btn primary" data-action="new-job">Create job post</button>')}</div>`;
}

async function renderSaved() {
  const data = await api('/student/saved-jobs');
  $('#page-content').innerHTML = pageHeader('Shortlist', 'Saved opportunities', 'Roles you want to revisit before the deadline.') + `<div class="card-grid">${data.jobs.length ? data.jobs.map(jobCard).join('') : emptyState('◇', 'No saved jobs yet', 'Save interesting opportunities to build your shortlist.')}</div>`;
}

async function renderApplications() {
  const data = await api('/applications');
  const rows = data.applications.map((application) => {
    if (state.user.role === 'student') return `<tr><td><div class="table-person"><span>${escapeHtml(application.company_name[0])}</span><div><b>${escapeHtml(application.title)}</b><small>${escapeHtml(application.company_name)}</small></div></div></td><td>${titleCase(application.type)}</td><td>${statusPill(application.status)}</td><td>${formatDate(application.created_at)}</td><td>${application.scheduled_at ? formatDate(application.scheduled_at, true) : '—'}</td></tr>`;
    const actions = state.user.role === 'admin' || state.user.role === 'recruiter' ? `<select class="status-select" data-id="${application.id}"><option value="">Update status</option>${['under_review','shortlisted','interview_scheduled','selected','rejected'].map((status) => `<option value="${status}" ${application.status === status ? 'selected' : ''}>${titleCase(status)}</option>`).join('')}</select><button class="link-button" data-action="schedule" data-id="${application.id}">Schedule</button>${application.resume_path ? `<button class="link-button" data-action="download" data-path="${escapeHtml(application.resume_path)}">Resume</button>` : ''}` : '';
    return `<tr><td><div class="table-person"><span>${initials(application.full_name)}</span><div><b>${escapeHtml(application.full_name)}</b><small>${escapeHtml(application.register_number || application.company_name || '')}</small></div></div></td><td>${escapeHtml(application.title)}</td><td>${application.cgpa ?? '—'}</td><td>${application.resume_score ?? '—'}</td><td>${statusPill(application.status)}</td><td><div class="table-actions">${actions}</div></td></tr>`;
  }).join('');
  const studentHeaders = '<th>Opportunity</th><th>Type</th><th>Status</th><th>Applied</th><th>Interview</th>';
  const otherHeaders = '<th>Candidate</th><th>Opportunity</th><th>CGPA</th><th>Resume score</th><th>Status</th><th>Actions</th>';
  $('#page-content').innerHTML = pageHeader('Pipeline', state.user.role === 'student' ? 'Track applications' : 'Application pipeline', state.user.role === 'student' ? 'Every application and its latest status.' : 'Review candidates and move the strongest profiles forward.') + (rows ? `<div class="data-table-wrap"><table><thead><tr>${state.user.role === 'student' ? studentHeaders : otherHeaders}</tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('◫', 'No applications yet', state.user.role === 'student' ? 'Browse opportunities and submit your first application.' : 'Applications will appear when students apply.'));
}

async function renderInterviews() {
  const data = await api('/interviews');
  const rows = data.interviews.map((item) => `<tr><td>${formatDate(item.scheduled_at, true)}</td><td><div class="table-person"><span>${initials(item.full_name)}</span><div><b>${state.user.role === 'student' ? escapeHtml(item.company_name) : escapeHtml(item.full_name)}</b><small>${escapeHtml(item.title)}</small></div></div></td><td>${titleCase(item.mode)}</td><td>${item.duration_minutes} minutes</td><td>${item.meeting_link ? `<a class="link-button" href="${escapeHtml(item.meeting_link)}" target="_blank" rel="noopener">Join meeting ↗</a>` : escapeHtml(item.location || 'To be shared')}</td><td>${statusPill(item.result)}</td></tr>`).join('');
  $('#page-content').innerHTML = pageHeader('Schedule', 'Interviews', 'A single view of every upcoming conversation.') + (rows ? `<div class="data-table-wrap"><table><thead><tr><th>Date & time</th><th>${state.user.role === 'student' ? 'Company' : 'Candidate'}</th><th>Mode</th><th>Duration</th><th>Location</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('◷', 'No interviews scheduled', 'Upcoming interview details will appear here.'));
}

async function renderTalent() {
  const data = await api('/talent');
  const cards = data.students.map((student) => `<article class="data-card opportunity-card"><div class="company-row"><span class="company-logo">${initials(student.full_name)}</span><div><b>${escapeHtml(student.full_name)}</b><small>${escapeHtml(student.department_name || 'Department not set')} · Year ${student.academic_year}</small></div></div><h3>CGPA ${student.cgpa} · Score ${student.resume_score}/100</h3><p>${escapeHtml(student.skills || 'Skills are being updated')}</p><div class="tag-row">${String(student.skills || '').split(',').slice(0, 4).map((skill) => skill && `<span class="tag">${escapeHtml(skill.trim())}</span>`).join('')}</div><div class="opportunity-meta"><span>Rank score ${student.ranking_score}</span><span>${escapeHtml(student.register_number)}</span></div><div class="card-actions"><button class="btn primary small" data-action="view-student" data-id="${student.id}">View profile</button>${student.resume_path ? `<button class="btn glass small" data-action="download" data-path="${escapeHtml(student.resume_path)}">Resume</button>` : ''}<button class="btn glass small" data-action="start-chat" data-student="${student.id}">Message</button></div></article>`).join('');
  $('#page-content').innerHTML = pageHeader('Talent intelligence', 'Discover exceptional students', 'Search verified profiles by skill, CGPA, and department.') + `<div class="filters"><input id="talent-search" placeholder="Search names, skills or departments"><select id="talent-department"><option value="">All departments</option>${state.departments.map((department) => `<option value="${department.name}">${escapeHtml(department.name)}</option>`).join('')}</select></div><div class="card-grid" id="talent-grid">${cards || emptyState('⌕', 'No profiles found', 'Student profiles appear after account approval.')}</div>`;
  const filter = () => { const query = $('#talent-search').value.toLowerCase(); const dept = $('#talent-department').value; const filtered = data.students.filter((student) => (!query || `${student.full_name} ${student.skills} ${student.department_name}`.toLowerCase().includes(query)) && (!dept || student.department_name === dept)); $('#talent-grid').innerHTML = filtered.length ? filtered.map((student) => cardsForStudent(student)).join('') : emptyState('⌕', 'No matching students', 'Try changing your search.'); };
  $('#talent-search').addEventListener('input', filter); $('#talent-department').addEventListener('change', filter);
}

function cardsForStudent(student) {
  return `<article class="data-card opportunity-card"><div class="company-row"><span class="company-logo">${initials(student.full_name)}</span><div><b>${escapeHtml(student.full_name)}</b><small>${escapeHtml(student.department_name || '')}</small></div></div><h3>CGPA ${student.cgpa} · Resume ${student.resume_score}/100</h3><p>${escapeHtml(student.skills || 'Skills are being updated')}</p><div class="card-actions"><button class="btn primary small" data-action="view-student" data-id="${student.id}">View profile</button>${student.resume_path ? `<button class="btn glass small" data-action="download" data-path="${escapeHtml(student.resume_path)}">Resume</button>` : ''}<button class="btn glass small" data-action="start-chat" data-student="${student.id}">Message</button></div></article>`;
}

async function renderProfile() {
  const data = await api('/profile'); const p = data.profile || {};
  if (state.user.role === 'recruiter') {
    $('#page-content').innerHTML = pageHeader('Identity', 'Company profile', 'Keep your employer brand accurate for students.') + `<div class="profile-layout"><aside class="panel profile-card"><div class="profile-avatar">${initials(p.company_name)}</div><h2>${escapeHtml(p.company_name)}</h2><p>${escapeHtml(p.industry)}</p>${statusPill('active')}<div class="section-divider"></div><form id="logo-form" class="file-upload"><b>Company logo</b><input type="file" name="logo" accept=".png,.jpg,.jpeg,.webp" required><button class="btn glass small" type="submit">Upload logo</button></form></aside><section class="panel"><h3>Company details</h3><form id="profile-form" class="form-grid two"><label class="form-field">Contact name<input name="full_name" value="${escapeHtml(p.full_name)}" required></label><label class="form-field">Company name<input name="company_name" value="${escapeHtml(p.company_name)}"></label><label class="form-field">Industry<input name="industry" value="${escapeHtml(p.industry)}"></label><label class="form-field">Website<input name="website" type="url" value="${escapeHtml(p.website || '')}"></label><label class="form-field">Headquarters<input name="headquarters" value="${escapeHtml(p.headquarters || '')}"></label><label class="form-field">Company size<input name="company_size" value="${escapeHtml(p.company_size || '')}"></label><label class="form-field" style="grid-column:1/-1">About the company<textarea name="description" rows="5">${escapeHtml(p.description || '')}</textarea></label><button class="btn primary" type="submit">Save company profile</button></form></section></div>`;
  } else {
    const skills = data.skills || String(p.skills || '').split(',').filter(Boolean).map((name) => ({ name }));
    $('#page-content').innerHTML = pageHeader('Career identity', 'My profile', 'A complete profile earns a stronger resume score and ranking.') + `<div class="profile-layout"><aside class="panel profile-card"><div class="profile-avatar">${initials(p.full_name)}</div><h2>${escapeHtml(p.full_name)}</h2><p>${escapeHtml(p.department_name || '')} · Year ${p.academic_year}</p><div class="score-progress"><div><span>Resume score</span><b>${p.resume_score}/100</b></div><div class="progress"><i style="width:${p.resume_score}%"></i></div></div><div class="section-divider"></div><button class="btn glass full" data-action="download" data-path="${escapeHtml(p.resume_path || '')}" ${p.resume_path ? '' : 'disabled'}>Download resume</button></aside><div class="profile-content"><section class="panel"><h3>Academic & social details</h3><form id="profile-form" class="form-grid two"><label class="form-field">Full name<input name="full_name" value="${escapeHtml(p.full_name)}" required></label><label class="form-field">Register number<input value="${escapeHtml(p.register_number)}" disabled></label><label class="form-field">Department<select name="department_id" class="department-select"></select></label><label class="form-field">Academic year<input type="number" min="1" max="6" name="academic_year" value="${p.academic_year}"></label><label class="form-field">CGPA<input type="number" min="0" max="10" step="0.01" name="cgpa" value="${p.cgpa}"></label><label class="form-field">LinkedIn URL<input type="url" name="linkedin_url" value="${escapeHtml(p.linkedin_url || '')}"></label><label class="form-field">GitHub URL<input type="url" name="github_url" value="${escapeHtml(p.github_url || '')}"></label><label class="form-field">Portfolio URL<input type="url" name="portfolio_url" value="${escapeHtml(p.portfolio_url || '')}"></label><label class="form-field" style="grid-column:1/-1">Profile summary<textarea name="bio" rows="4">${escapeHtml(p.bio || '')}</textarea></label><button class="btn primary" type="submit">Save profile</button></form></section><section class="panel"><div class="panel-header"><div><h2>Skills</h2><p>${skills.length} skills strengthen your ranking</p></div><button data-action="add-skill">+ Add skill</button></div><div class="skill-list">${skills.length ? skills.map((skill) => `<span class="skill-chip">${escapeHtml(skill.name)}${skill.id ? `<button data-action="remove-skill" data-id="${skill.id}">×</button>` : ''}</span>`).join('') : '<span class="metric-foot">Add your technical and professional skills.</span>'}</div></section><section class="panel"><div class="panel-header"><div><h2>Projects</h2><p>Show recruiters what you can build</p></div><button data-action="add-project">+ Add project</button></div><div class="project-list">${data.projects.length ? data.projects.map((project) => `<article class="project-item"><header><b>${escapeHtml(project.title)}</b><button class="link-button" data-action="delete-project" data-id="${project.id}">Remove</button></header><p>${escapeHtml(project.description || '')}</p><span class="tag">${escapeHtml(project.technologies || 'Project')}</span></article>`).join('') : '<span class="metric-foot">No projects added yet.</span>'}</div></section><section class="panel"><div class="panel-header"><div><h2>Documents</h2><p>PDF resume and verified certificates</p></div></div><div class="form-grid two"><form id="resume-form" class="file-upload"><b>Resume</b><input type="file" name="resume" accept="application/pdf" required><button class="btn glass small" type="submit">Upload PDF</button></form><form id="certificate-form" class="file-upload"><b>Certificate</b><input name="name" placeholder="Certificate name" required><input name="issuer" placeholder="Issuer"><input type="date" name="issued_on"><input type="file" name="certificate" accept=".pdf,.png,.jpg,.jpeg" required><button class="btn glass small" type="submit">Add certificate</button></form></div></section></div></div>`;
    fillDepartmentSelects(); $('.department-select').value = p.department_id || '';
  }
}

async function renderRankings() {
  const data = await api('/rankings'); const top = data.rankings.slice(0, 3); const podium = [top[1], top[0], top[2]].filter(Boolean);
  const rows = data.rankings.map((item) => `<tr><td><b>#${item.rank}</b></td><td><div class="table-person"><span>${initials(item.full_name)}</span><div><b>${escapeHtml(item.full_name)}</b><small>${escapeHtml(item.department_name || '')}</small></div></div></td><td>${item.cgpa}</td><td>${item.resume_score}</td><td>${item.skills_count}</td><td>${item.certificates_count}</td><td><b>${Number(item.ranking_score).toFixed(1)}</b></td></tr>`).join('');
  $('#page-content').innerHTML = pageHeader('Placement readiness', 'Campus leaderboard', 'Ranking: CGPA 40% · Resume 35% · Skills 15% · Certificates 10%.') + `<div class="ranking-podium">${podium.map((item) => `<article class="podium-item ${item.rank === 1 ? 'first' : ''}"><span class="medal">${item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}</span><h3>${escapeHtml(item.full_name)}</h3><p>${escapeHtml(item.department_name || '')}</p><b>${Number(item.ranking_score).toFixed(1)}</b></article>`).join('')}</div><div class="data-table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>CGPA</th><th>Resume</th><th>Skills</th><th>Certificates</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderNotifications() {
  const data = await api('/notifications');
  $('#page-content').innerHTML = pageHeader('Inbox', 'Notifications', 'Updates about applications, interviews, approvals, and campus news.') + `<section class="panel notification-list">${data.notifications.length ? data.notifications.map((item) => `<article class="notification-item ${item.is_read ? '' : 'unread'}" data-action="read-notification" data-id="${item.id}"><span>${item.type === 'interview' ? '◷' : item.type === 'application' ? '◫' : '♢'}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.message)}</p><time>${relativeTime(item.created_at)}</time></div></article>`).join('') : emptyState('♢', 'You are all caught up', 'New updates will arrive here.')}</section>`;
}

async function refreshUnread() {
  try { const data = await api('/notifications'); const count = data.notifications.filter((item) => !item.is_read).length; $('#unread-dot').style.display = count ? '' : 'none'; } catch (_) { /* session navigation will handle errors */ }
}

async function renderAnnouncements() {
  const data = await api('/announcements');
  const action = state.user.role === 'admin' ? '<button class="btn primary" data-action="new-announcement">+ Publish announcement</button>' : '';
  $('#page-content').innerHTML = pageHeader('Campus news', 'Announcements', 'Important updates from the placement office.', action) + (data.announcements.length ? data.announcements.map((item) => `<article class="data-card announcement-card"><header><h3>${item.is_pinned ? '◈ ' : ''}${escapeHtml(item.title)}</h3><time>${formatDate(item.published_at)}</time></header><p>${escapeHtml(item.content)}</p><span class="type-pill">${titleCase(item.audience)}</span></article>`).join('') : emptyState('◈', 'No active announcements', 'Placement-office updates will appear here.'));
}

async function renderApprovals() {
  const data = await api('/admin/approvals');
  const cards = (items, role) => items.map((item) => `<article class="data-card approval-card"><header><span class="company-logo">${initials(item.full_name)}</span><div><h3>${escapeHtml(item.full_name)}</h3><small>${escapeHtml(role === 'student' ? item.register_number : item.company_name)}</small></div></header><p>${escapeHtml(item.email)}<br>${escapeHtml(role === 'student' ? `${item.department_name || ''} · Year ${item.academic_year}` : `${item.industry} · ${item.website || 'Website not supplied'}`)}</p>${role === 'recruiter' ? `<button class="link-button" data-action="download" data-path="${escapeHtml(item.verification_document)}">View verification document</button>` : ''}<div class="card-actions"><button class="btn success small" data-action="approval" data-id="${item.id}" data-decision="approve">Approve</button><button class="btn danger small" data-action="approval" data-id="${item.id}" data-decision="reject">Reject</button></div></article>`).join('');
  $('#page-content').innerHTML = pageHeader('Governance', 'Pending approvals', 'Verify every student and recruiter before they enter the platform.') + `<div class="approval-grid"><section class="panel"><div class="panel-header"><div><h2>Students</h2><p>${data.students.length} awaiting review</p></div></div>${cards(data.students, 'student') || emptyState('✓', 'Student queue is clear', 'New registrations will appear here.')}</section><section class="panel"><div class="panel-header"><div><h2>Recruiters</h2><p>${data.recruiters.length} awaiting verification</p></div></div>${cards(data.recruiters, 'recruiter') || emptyState('✓', 'Recruiter queue is clear', 'New verification requests will appear here.')}</section></div>`;
}

async function renderUsers() {
  const data = await api('/admin/users');
  const rows = data.users.map((user) => `<tr><td><div class="table-person"><span>${initials(user.full_name)}</span><div><b>${escapeHtml(user.full_name)}</b><small>${escapeHtml(user.email)}</small></div></div></td><td>${titleCase(user.role)}</td><td>${escapeHtml(user.reference || '—')}</td><td>${statusPill(user.status)}</td><td>${formatDate(user.created_at)}</td><td><select class="user-status" data-id="${user.id}" ${user.id === state.user.id ? 'disabled' : ''}><option value="">Change status</option>${['active','suspended','rejected'].map((status) => `<option value="${status}">${titleCase(status)}</option>`).join('')}</select></td></tr>`).join('');
  $('#page-content').innerHTML = pageHeader('Administration', 'Manage users', 'Search and govern every CampusConnect account.') + `<div class="filters"><input id="user-search" placeholder="Search by name or email"><select id="user-role"><option value="">Every role</option><option value="student">Students</option><option value="recruiter">Recruiters</option><option value="admin">Admins</option></select></div><div class="data-table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Reference</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody id="users-body">${rows}</tbody></table></div>`;
}

async function renderDepartments() {
  const data = await api('/departments'); state.departments = data.departments;
  const rows = data.departments.map((item) => `<tr><td><b>${escapeHtml(item.code)}</b></td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.hod_name || '—')}</td><td>${item.student_count}</td><td>${statusPill(item.is_active ? 'active' : 'suspended')}</td></tr>`).join('');
  $('#page-content').innerHTML = pageHeader('Campus structure', 'Departments', 'Manage the academic units used across profiles and rankings.', '<button class="btn primary" data-action="new-department">+ Add department</button>') + `<div class="data-table-wrap"><table><thead><tr><th>Code</th><th>Department</th><th>Head</th><th>Students</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderReports() {
  const cards = [['students','◎','Student report','Profiles, academics, readiness scores, and account status.'],['recruiters','◇','Recruiter report','Verified companies, industries, and posting activity.'],['placements','↗','Placement report','Application outcomes, packages, companies, and selected students.']];
  $('#page-content').innerHTML = pageHeader('Insights', 'Download reports', 'Export clean CSV reports for review and institutional reporting.') + `<div class="report-grid">${cards.map(([type, icon, title, description]) => `<article class="data-card report-card"><span>${icon}</span><h3>${title}</h3><p>${description}</p><button class="btn glass" data-action="report" data-type="${type}">Download CSV ↧</button></article>`).join('')}</div>`;
}

async function renderActivity() {
  const data = await api('/admin/activity-logs');
  const rows = data.logs.map((item) => `<tr><td>${formatDate(item.created_at, true)}</td><td><div class="table-person"><span>${initials(item.full_name || 'System')}</span><div><b>${escapeHtml(item.full_name || 'System')}</b><small>${titleCase(item.role || '')}</small></div></div></td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entity_type || '—')}</td><td>${escapeHtml(item.ip_address || '—')}</td></tr>`).join('');
  $('#page-content').innerHTML = pageHeader('Audit trail', 'Activity logs', 'A chronological record of important actions across the platform.') + `<div class="data-table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Area</th><th>IP address</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderChat() {
  const data = await api('/chat/conversations');
  $('#page-content').innerHTML = pageHeader('Real-time', state.user.role === 'admin' ? 'Chat monitor' : 'Messages', state.user.role === 'admin' ? 'Review student–recruiter conversations for safety and governance.' : 'Secure, direct conversations around opportunities.') + `<div class="chat-layout ${data.conversations.length ? '' : 'show-list'}" id="chat-layout"><aside class="conversation-list"><header><h2>Conversations</h2></header>${data.conversations.length ? data.conversations.map((item) => `<button class="conversation-item" data-action="open-conversation" data-id="${item.id}" data-name="${escapeHtml(state.user.role === 'student' ? item.company_name : item.student_name)}"><span>${initials(state.user.role === 'student' ? item.company_name : item.student_name)}</span><div><b>${escapeHtml(state.user.role === 'student' ? item.company_name : item.student_name)}</b><small>${escapeHtml(item.last_message || item.title || 'Start the conversation')}</small></div></button>`).join('') : emptyState('◌', 'No conversations yet', state.user.role === 'admin' ? 'Chat logs will appear after students and recruiters connect.' : 'Open a student or opportunity to begin messaging.')}</aside><section class="message-pane" id="message-pane">${emptyState('◌', 'Choose a conversation', 'Messages will appear here.')}</section></div>`;
  if (data.conversations.length && window.innerWidth > 580) openConversation(data.conversations[0].id, state.user.role === 'student' ? data.conversations[0].company_name : data.conversations[0].student_name);
}

async function openConversation(id, name) {
  state.conversationId = Number(id);
  $$('.conversation-item').forEach((item) => item.classList.toggle('active', Number(item.dataset.id) === Number(id)));
  const data = await api(`/chat/conversations/${id}/messages`);
  $('#message-pane').innerHTML = `<header class="message-header"><b>${escapeHtml(name || 'Conversation')}</b><small>${state.user.role === 'admin' ? 'Read-only audit view' : '● Connected securely'}</small></header><div class="messages" id="messages">${data.messages.map(messageHtml).join('')}</div>${state.user.role === 'admin' ? '' : '<form class="message-form" id="message-form"><input name="body" autocomplete="off" placeholder="Write a message…" maxlength="4000" required><button type="submit">→</button></form>'}`;
  $('#chat-layout').classList.remove('show-list');
  if (state.socket) state.socket.emit('conversation:join', Number(id));
  const messages = $('#messages'); if (messages) messages.scrollTop = messages.scrollHeight;
}
function messageHtml(message) { return `<article class="message ${Number(message.sender_id) === Number(state.user.id) ? 'mine' : ''}"><p>${escapeHtml(message.body)}</p><time>${formatDate(message.created_at, true)}</time></article>`; }
function appendMessage(message) { const container = $('#messages'); if (!container) return; container.insertAdjacentHTML('beforeend', messageHtml(message)); container.scrollTop = container.scrollHeight; }

function jobForm(job = {}) {
  return `<h2>${job.id ? 'Edit opportunity' : 'Create an opportunity'}</h2><p class="modal-subtitle">Publish a clear, complete role for the campus talent pool.</p><form id="job-form" data-id="${job.id || ''}" class="form-grid two"><label class="form-field">Opportunity type<select name="type" required><option value="internship" ${job.type === 'internship' ? 'selected' : ''}>Internship</option><option value="placement" ${job.type === 'placement' ? 'selected' : ''}>Placement drive</option></select></label><label class="form-field">Role title<input name="title" value="${escapeHtml(job.title || '')}" required></label><label class="form-field">Location<input name="location" value="${escapeHtml(job.location || '')}"></label><label class="form-field">Work mode<select name="work_mode"><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label><label class="form-field">Duration<input name="duration" value="${escapeHtml(job.duration || '')}"></label><label class="form-field">Openings<input type="number" min="1" name="openings" value="${job.openings || 1}"></label><label class="form-field">Monthly stipend (₹)<input type="number" min="0" name="stipend" value="${job.stipend || ''}"></label><label class="form-field">Package (LPA)<input type="number" min="0" step="0.1" name="package_lpa" value="${job.package_lpa || ''}"></label><label class="form-field">Minimum CGPA<input type="number" min="0" max="10" step="0.01" name="eligibility_cgpa" value="${job.eligibility_cgpa || 0}"></label><label class="form-field">Application deadline<input type="date" name="application_deadline" value="${job.application_deadline ? new Date(job.application_deadline).toISOString().slice(0, 10) : ''}" required></label><label class="form-field" style="grid-column:1/-1">Skills required<input name="skills_required" value="${escapeHtml(job.skills_required || '')}" placeholder="Node.js, SQL, communication"></label><label class="form-field" style="grid-column:1/-1">Eligible departments<input name="eligible_departments" value="${escapeHtml(job.eligible_departments || '')}" placeholder="CSE, IT, ECE or All"></label><label class="form-field" style="grid-column:1/-1">Role description<textarea name="description" rows="5" required>${escapeHtml(job.description || '')}</textarea></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="btn glass" data-close-modal>Cancel</button><button type="submit" class="btn primary">${job.id ? 'Save changes' : 'Publish opportunity'}</button></div></form>`;
}

async function downloadProtected(path, filename) {
  if (!path) return;
  const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'File could not be downloaded.'); }
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename || path.split('/').pop(); anchor.click(); URL.revokeObjectURL(url);
}

async function downloadReport(type) {
  const response = await fetch(`/api/admin/reports/${type}`, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) throw new Error('Report could not be generated.');
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `campusconnect-${type}-report.csv`; anchor.click(); URL.revokeObjectURL(url);
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  if (action === 'apply') openModal(`<h2>Submit application</h2><p class="modal-subtitle">Add a concise note for the recruiting team.</p><form id="apply-form" data-id="${id}"><label class="form-field">Cover letter<textarea name="cover_letter" rows="6" placeholder="Share why this role is a strong fit for you."></textarea></label><div class="modal-actions"><button type="button" class="btn glass" data-close-modal>Cancel</button><button class="btn primary" type="submit">Submit application</button></div></form>`);
  if (action === 'save') { const result = await api(`/jobs/${id}/save`, { method: 'POST' }); toast(result.message); if (state.currentPage === 'saved') navigate('saved'); }
  if (action === 'new-job') openModal(jobForm());
  if (action === 'edit-job') { const data = await api('/recruiter/jobs'); const job = data.jobs.find((item) => Number(item.id) === Number(id)); if (!job) throw new Error('Opportunity not found.'); openModal(jobForm(job)); }
  if (action === 'close-job') { if (!confirm('Close this opportunity? Existing applications will remain available.')) return; const result = await api(`/jobs/${id}`, { method: 'DELETE' }); toast(result.message); navigate(state.currentPage); }
  if (action === 'schedule') openModal(`<h2>Schedule interview</h2><p class="modal-subtitle">The student will receive an instant notification.</p><form id="interview-form" data-id="${id}" class="form-grid two"><label class="form-field">Date and time<input type="datetime-local" name="scheduled_at" required></label><label class="form-field">Mode<select name="mode"><option value="online">Online</option><option value="onsite">On-site</option><option value="phone">Phone</option></select></label><label class="form-field">Duration (minutes)<input type="number" name="duration_minutes" value="45" min="15"></label><label class="form-field">Meeting link<input type="url" name="meeting_link"></label><label class="form-field" style="grid-column:1/-1">Location / notes<input name="location"></label><div class="modal-actions" style="grid-column:1/-1"><button type="button" class="btn glass" data-close-modal>Cancel</button><button class="btn primary" type="submit">Schedule & notify</button></div></form>`);
  if (action === 'download') { try { await downloadProtected(element.dataset.path); } catch (error) { toast(error.message, 'error'); } }
  if (action === 'read-notification') { await api(`/notifications/${id}/read`, { method: 'PATCH' }); element.classList.remove('unread'); refreshUnread(); }
  if (action === 'approval') { const decision = element.dataset.decision; let reason = ''; if (decision === 'reject') reason = prompt('Reason for rejection:') || 'Registration did not meet verification requirements.'; const result = await api(`/admin/approvals/${id}`, { method: 'PATCH', body: { decision, reason } }); toast(result.message); navigate('approvals'); }
  if (action === 'new-department') openModal(`<h2>Add department</h2><p class="modal-subtitle">This department becomes available in student profiles and rankings.</p><form id="department-form" class="form-grid"><label class="form-field">Department name<input name="name" required></label><label class="form-field">Short code<input name="code" required></label><label class="form-field">Head of department<input name="hod_name"></label><div class="modal-actions"><button type="button" class="btn glass" data-close-modal>Cancel</button><button class="btn primary" type="submit">Add department</button></div></form>`);
  if (action === 'new-announcement') openModal(`<h2>Publish announcement</h2><p class="modal-subtitle">Everyone in the selected audience receives a notification.</p><form id="announcement-form" class="form-grid"><label class="form-field">Title<input name="title" required></label><label class="form-field">Audience<select name="audience"><option value="all">Everyone</option><option value="student">Students</option><option value="recruiter">Recruiters</option></select></label><label class="form-field">Announcement<textarea name="content" rows="6" required></textarea></label><label class="form-field">Expires at<input type="datetime-local" name="expires_at"></label><label class="form-field"><span><input type="checkbox" name="is_pinned" style="width:auto"> Pin this announcement</span></label><div class="modal-actions"><button type="button" class="btn glass" data-close-modal>Cancel</button><button class="btn primary" type="submit">Publish now</button></div></form>`);
  if (action === 'report') { await downloadReport(element.dataset.type); toast('Report downloaded.'); }
  if (action === 'add-skill') { const name = prompt('Skill name:'); if (name) { await api('/student/skills', { method: 'POST', body: { name } }); toast('Skill added.'); navigate('profile'); } }
  if (action === 'remove-skill') { await api(`/student/skills/${id}`, { method: 'DELETE' }); toast('Skill removed.'); navigate('profile'); }
  if (action === 'add-project') openModal(`<h2>Add a project</h2><p class="modal-subtitle">Strong projects make your profile memorable.</p><form id="project-form" class="form-grid"><label class="form-field">Project title<input name="title" required></label><label class="form-field">Description<textarea name="description" rows="4"></textarea></label><label class="form-field">Technologies<input name="technologies"></label><label class="form-field">Project URL<input type="url" name="project_url"></label><label class="form-field">GitHub URL<input type="url" name="github_url"></label><div class="modal-actions"><button type="button" class="btn glass" data-close-modal>Cancel</button><button class="btn primary" type="submit">Add project</button></div></form>`);
  if (action === 'delete-project') { await api(`/student/projects/${id}`, { method: 'DELETE' }); toast('Project removed.'); navigate('profile'); }
  if (action === 'open-conversation') openConversation(id, element.dataset.name);
  if (action === 'start-chat') { const result = await api('/chat/conversations', { method: 'POST', body: { student_id: element.dataset.student } }); await navigate('chat'); openConversation(result.conversation_id, 'Student conversation'); }
  if (action === 'view-student') { const data = await api(`/talent/${id}`); const p = data.profile; openModal(`<h2>${escapeHtml(p.full_name)}</h2><p class="modal-subtitle">${escapeHtml(p.department_name)} · ${escapeHtml(p.register_number)}</p><div class="metrics-grid">${metric('CGPA', p.cgpa, '◎','Academic performance')}${metric('Resume', `${p.resume_score}/100`, '⌁','Profile quality')}${metric('Rank score', p.ranking_score, '♕','Composite score')}</div><p style="color:var(--muted);font-size:12px;line-height:1.7">${escapeHtml(p.bio || 'This student is building their CampusConnect profile.')}</p><div class="skill-list">${String(p.skills || '').split(',').filter(Boolean).map((skill) => `<span class="skill-chip">${escapeHtml(skill)}</span>`).join('')}</div>`); }
}

document.addEventListener('click', async (event) => {
  const authButton = event.target.closest('[data-auth]'); if (authButton) showAuth(authButton.dataset.auth);
  const tabButton = event.target.closest('[data-auth-tab]'); if (tabButton) switchAuthTab(tabButton.dataset.authTab);
  if (event.target.closest('[data-close-modal]') || event.target.classList.contains('modal-backdrop')) closeModals();
  const pageButton = event.target.closest('[data-page]'); if (pageButton && state.user) navigate(pageButton.dataset.page);
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) { try { await handleAction(actionButton.dataset.action, actionButton); } catch (error) { toast(error.message, 'error'); } }
});

document.addEventListener('change', async (event) => {
  try {
    if (event.target.matches('.status-select') && event.target.value) { const result = await api(`/applications/${event.target.dataset.id}/status`, { method: 'PATCH', body: { status: event.target.value } }); toast(result.message); navigate('applications'); }
    if (event.target.matches('.user-status') && event.target.value) { const result = await api(`/admin/users/${event.target.dataset.id}`, { method: 'PATCH', body: { status: event.target.value } }); toast(result.message); navigate('users'); }
  } catch (error) { toast(error.message, 'error'); }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['login-form','student-form','recruiter-form','contact-form'].includes(form.id)) event.preventDefault();
  const button = $('button[type="submit"]', form); if (button && !['login-form','student-form','recruiter-form'].includes(form.id)) setBusy(button, true);
  try {
    if (form.id === 'contact-form') { event.preventDefault(); const result = await api('/public/contact', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast(result.message); form.reset(); }
    if (form.id === 'profile-form') { const result = await api('/profile', { method: 'PUT', body: Object.fromEntries(new FormData(form)) }); toast(result.message); navigate('profile'); }
    if (form.id === 'logo-form') { const result = await api('/recruiter/logo', { method: 'POST', body: new FormData(form) }); toast(result.message); navigate('profile'); }
    if (form.id === 'resume-form') { const result = await api('/student/resume', { method: 'POST', body: new FormData(form) }); toast(result.message); navigate('profile'); }
    if (form.id === 'certificate-form') { const result = await api('/student/certificates', { method: 'POST', body: new FormData(form) }); toast(result.message); navigate('profile'); }
    if (form.id === 'project-form') { const result = await api('/student/projects', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast(result.message); closeModals(); navigate('profile'); }
    if (form.id === 'apply-form') { const result = await api(`/jobs/${form.dataset.id}/apply`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast(result.message); closeModals(); navigate('applications'); }
    if (form.id === 'job-form') { const body = Object.fromEntries(new FormData(form)); const result = await api(form.dataset.id ? `/jobs/${form.dataset.id}` : '/recruiter/jobs', { method: form.dataset.id ? 'PUT' : 'POST', body }); toast(result.message); closeModals(); navigate('jobs'); }
    if (form.id === 'interview-form') { const body = { ...Object.fromEntries(new FormData(form)), application_id: form.dataset.id }; const result = await api('/interviews', { method: 'POST', body }); toast(result.message); closeModals(); navigate('interviews'); }
    if (form.id === 'department-form') { const result = await api('/admin/departments', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast(result.message); closeModals(); navigate('departments'); }
    if (form.id === 'announcement-form') { const body = Object.fromEntries(new FormData(form)); body.is_pinned = form.is_pinned.checked; const result = await api('/admin/announcements', { method: 'POST', body }); toast(result.message); closeModals(); navigate('announcements'); }
    if (form.id === 'message-form') { const body = form.body.value.trim(); if (body && state.socket) state.socket.emit('message:send', { conversation_id: state.conversationId, body }, (response) => { if (!response.ok) toast(response.message, 'error'); }); form.reset(); }
  } catch (error) { toast(error.message, 'error'); }
  finally { if (button) setBusy(button, false); }
});

$('#login-form').addEventListener('submit', (event) => handleAuthForm(event, '/auth/login'));
$('#student-form').addEventListener('submit', (event) => handleAuthForm(event, '/auth/register/student'));
$('#recruiter-form').addEventListener('submit', (event) => handleAuthForm(event, '/auth/register/recruiter'));
$('#logout-btn').addEventListener('click', () => logout());
$('#sidebar-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#mobile-menu').addEventListener('click', () => showAuth('login'));
$('#global-search').addEventListener('click', () => navigate(state.user.role === 'recruiter' ? 'talent' : 'opportunities'));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && state.user) { event.preventDefault(); navigate(state.user.role === 'recruiter' ? 'talent' : 'opportunities'); } if (event.key === 'Escape') closeModals(); });

loadPublicOverview();
if (state.token && state.user) startPortal();
