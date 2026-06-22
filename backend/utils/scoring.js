'use strict';

function calculateResumeScore(profile) {
  let score = 0;
  score += Math.min(Number(profile.cgpa || 0) * 2.5, 25);
  score += Math.min(Number(profile.skills_count || 0) * 3, 18);
  score += Math.min(Number(profile.projects_count || 0) * 5, 15);
  score += Math.min(Number(profile.certificates_count || 0) * 4, 12);
  score += profile.github_url ? 8 : 0;
  score += profile.linkedin_url ? 7 : 0;
  score += profile.resume_path ? 15 : 0;
  return Math.min(100, Math.round(score));
}

function calculateRankingScore(profile) {
  const cgpa = Math.min(100, Number(profile.cgpa || 0) * 10);
  const resume = Math.min(100, Number(profile.resume_score || 0));
  const skills = Math.min(100, Number(profile.skills_count || 0) * 10);
  const certificates = Math.min(100, Number(profile.certificates_count || 0) * 20);
  return Number((cgpa * 0.4 + resume * 0.35 + skills * 0.15 + certificates * 0.1).toFixed(2));
}

module.exports = { calculateResumeScore, calculateRankingScore };
