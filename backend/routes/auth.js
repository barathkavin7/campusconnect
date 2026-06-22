'use strict';

const express = require('express');
const { registerStudent, registerRecruiter, login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { required, validateEmail } = require('../middleware/validate');
const { companyDocUpload } = require('../middleware/upload');

const router = express.Router();

router.post('/register/student', required(['full_name','email','password','register_number','department_id','academic_year']), validateEmail, registerStudent);
router.post('/register/recruiter', companyDocUpload.single('verification_document'), required(['full_name','email','password','company_name','industry']), validateEmail, registerRecruiter);
router.post('/login', required(['email','password']), validateEmail, login);
router.get('/me', authenticate, me);

module.exports = router;
