'use strict';

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const uploadRoot = path.resolve(__dirname, '../../uploads');
const destinations = {
  resume: path.join(uploadRoot, 'resumes'),
  certificate: path.join(uploadRoot, 'certificates'),
  companyDoc: path.join(uploadRoot, 'company_docs'),
  logo: path.join(uploadRoot, 'logos')
};

Object.values(destinations).forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

function uploader(kind, types) {
  return multer({
    storage: multer.diskStorage({
      destination: destinations[kind],
      filename: (req, file, done) => done(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
    }),
    limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024 },
    fileFilter: (req, file, done) => types.includes(file.mimetype)
      ? done(null, true)
      : done(Object.assign(new Error('Unsupported file type.'), { status: 415 }))
  });
}

module.exports = {
  resumeUpload: uploader('resume', ['application/pdf']),
  certificateUpload: uploader('certificate', ['application/pdf', 'image/jpeg', 'image/png']),
  companyDocUpload: uploader('companyDoc', ['application/pdf', 'image/jpeg', 'image/png']),
  logoUpload: uploader('logo', ['image/jpeg', 'image/png', 'image/webp'])
};
