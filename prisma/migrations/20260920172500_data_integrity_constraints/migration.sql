-- Data-integrity CHECK constraints that Prisma's schema language cannot express.
-- Competency levels are integers on a 0..100 scale; importance/criticality use 1..5.

ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "User_failedLoginCount_nonnegative" CHECK ("failedLoginCount" >= 0);

ALTER TABLE "Role"
  ADD CONSTRAINT "Role_criticality_range" CHECK ("criticality" BETWEEN 1 AND 5);

ALTER TABLE "ProfileSkill"
  ADD CONSTRAINT "ProfileSkill_proficiency_range" CHECK ("proficiency" BETWEEN 1 AND 5);

ALTER TABLE "RoleCompetency"
  ADD CONSTRAINT "RoleCompetency_requiredLevel_range" CHECK ("requiredLevel" BETWEEN 0 AND 100),
  ADD CONSTRAINT "RoleCompetency_importance_range" CHECK ("importance" BETWEEN 1 AND 5);

ALTER TABLE "EmployeeCompetency"
  ADD CONSTRAINT "EmployeeCompetency_currentLevel_range" CHECK ("currentLevel" BETWEEN 0 AND 100);

ALTER TABLE "CompetencyHistory"
  ADD CONSTRAINT "CompetencyHistory_levels_range"
  CHECK ("previousLevel" BETWEEN 0 AND 100 AND "newLevel" BETWEEN 0 AND 100);

ALTER TABLE "Course"
  ADD CONSTRAINT "Course_passingScore_range" CHECK ("passingScore" BETWEEN 1 AND 100),
  ADD CONSTRAINT "Course_durationMinutes_nonnegative" CHECK ("durationMinutes" >= 0);

ALTER TABLE "CourseCompetency"
  ADD CONSTRAINT "CourseCompetency_levels_valid"
  CHECK ("levelFrom" BETWEEN 0 AND 100 AND "levelTo" BETWEEN 0 AND 100 AND "levelTo" > "levelFrom");

ALTER TABLE "Module"
  ADD CONSTRAINT "Module_position_nonnegative" CHECK ("position" >= 0),
  ADD CONSTRAINT "Module_durationMinutes_nonnegative" CHECK ("durationMinutes" >= 0);

ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_progress_range" CHECK ("progress" BETWEEN 0 AND 100);

ALTER TABLE "Assessment"
  ADD CONSTRAINT "Assessment_passingScore_range" CHECK ("passingScore" BETWEEN 1 AND 100),
  ADD CONSTRAINT "Assessment_maxAttempts_nonnegative" CHECK ("maxAttempts" >= 0),
  ADD CONSTRAINT "Assessment_timeLimitMinutes_positive" CHECK ("timeLimitMinutes" IS NULL OR "timeLimitMinutes" > 0),
  ADD CONSTRAINT "Assessment_questionsPerAttempt_positive" CHECK ("questionsPerAttempt" IS NULL OR "questionsPerAttempt" > 0);

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_marks_positive" CHECK ("marks" >= 1);

ALTER TABLE "AssessmentAttempt"
  ADD CONSTRAINT "AssessmentAttempt_attemptNumber_positive" CHECK ("attemptNumber" >= 1),
  ADD CONSTRAINT "AssessmentAttempt_percentage_range" CHECK ("percentage" IS NULL OR "percentage" BETWEEN 0 AND 100);

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "Feedback_trainerRating_range" CHECK ("trainerRating" IS NULL OR "trainerRating" BETWEEN 1 AND 5);

ALTER TABLE "TrainerEvaluation"
  ADD CONSTRAINT "TrainerEvaluation_ratings_range" CHECK (
    "technicalKnowledge" BETWEEN 1 AND 5
    AND "practicalAbility" BETWEEN 1 AND 5
    AND "participation" BETWEEN 1 AND 5
    AND "applicationOfKnowledge" BETWEEN 1 AND 5
    AND "overallCompetency" BETWEEN 1 AND 5
  ),
  ADD CONSTRAINT "TrainerEvaluation_weightedScore_range" CHECK ("weightedScore" BETWEEN 0 AND 100);
