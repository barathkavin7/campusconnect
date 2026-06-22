'use strict';

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { required, validateEmail } = require('../middleware/validate');
const uploads = require('../middleware/upload');
const portal = require('../controllers/portalController');
const opportunity = require('../controllers/opportunityController');
const admin = require('../controllers/adminController');
const chat = require('../controllers/chatController');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get('/public/overview', publicController.overview);
router.post('/public/contact', required(['name','email','subject','message']), validateEmail, publicController.contact);
router.get('/public/jobs', opportunity.listJobs);
router.get('/public/announcements', opportunity.announcements);

router.use(authenticate);
router.get('/dashboard', portal.dashboard);
router.get('/profile', authorize('student','recruiter'), portal.getProfile);
router.put('/profile', authorize('student','recruiter'), required(['full_name']), portal.updateProfile);
router.post('/recruiter/logo', authorize('recruiter'), uploads.logoUpload.single('logo'), portal.uploadCompanyLogo);
router.get('/departments', admin.departments);
router.get('/jobs', opportunity.listJobs);
router.get('/applications', opportunity.listApplications);
router.get('/interviews', opportunity.listInterviews);
router.get('/notifications', opportunity.notifications);
router.patch('/notifications/:id/read', opportunity.readNotification);
router.get('/rankings', opportunity.rankings);
router.get('/announcements', opportunity.announcements);
router.get('/chat/conversations', chat.listConversations);
router.post('/chat/conversations', authorize('student','recruiter'), chat.startConversation);
router.get('/chat/conversations/:id/messages', chat.messages);

router.post('/student/resume', authorize('student'), uploads.resumeUpload.single('resume'), portal.uploadResume);
router.post('/student/certificates', authorize('student'), uploads.certificateUpload.single('certificate'), required(['name']), portal.addCertificate);
router.post('/student/skills', authorize('student'), required(['name']), portal.addSkill);
router.delete('/student/skills/:id', authorize('student'), portal.removeSkill);
router.post('/student/projects', authorize('student'), required(['title']), portal.addProject);
router.delete('/student/projects/:id', authorize('student'), portal.deleteProject);
router.post('/jobs/:id/apply', authorize('student'), opportunity.apply);
router.post('/jobs/:id/save', authorize('student'), opportunity.toggleSave);
router.get('/student/saved-jobs', authorize('student'), opportunity.savedJobs);

router.get('/recruiter/jobs', authorize('recruiter'), opportunity.myJobs);
router.post('/recruiter/jobs', authorize('recruiter'), required(['type','title','description','application_deadline']), opportunity.createJob);
router.put('/jobs/:id', authorize('recruiter','admin'), opportunity.updateJob);
router.delete('/jobs/:id', authorize('recruiter','admin'), opportunity.deleteJob);
router.patch('/applications/:id/status', authorize('recruiter','admin'), opportunity.updateApplicationStatus);
router.get('/talent', authorize('recruiter','admin'), opportunity.talentPool);
router.get('/talent/:id', authorize('recruiter','admin'), opportunity.studentProfile);
router.post('/interviews', authorize('recruiter','admin'), required(['application_id','scheduled_at','mode']), opportunity.scheduleInterview);
router.post('/notifications', authorize('recruiter','admin'), required(['user_id','title','message']), admin.sendNotification);

router.get('/admin/approvals', authorize('admin'), admin.pendingApprovals);
router.patch('/admin/approvals/:id', authorize('admin'), required(['decision']), admin.decideApproval);
router.get('/admin/users', authorize('admin'), admin.users);
router.patch('/admin/users/:id', authorize('admin'), required(['status']), admin.updateUser);
router.post('/admin/departments', authorize('admin'), required(['name','code']), admin.addDepartment);
router.put('/admin/departments/:id', authorize('admin'), required(['name','code']), admin.updateDepartment);
router.post('/admin/announcements', authorize('admin'), required(['title','content']), admin.publishAnnouncement);
router.get('/admin/activity-logs', authorize('admin'), admin.activityLogs);
router.get('/admin/reports/:type', authorize('admin'), admin.report);

module.exports = router;
