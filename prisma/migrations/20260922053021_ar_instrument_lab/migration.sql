-- CreateEnum
CREATE TYPE "ARModuleKind" AS ENUM ('FULL_LAB', 'REFRESHER');

-- CreateEnum
CREATE TYPE "ARTaskPhase" AS ENUM ('TRAINING', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "ARTaskType" AS ENUM ('IDENTIFY', 'INSPECT');

-- CreateEnum
CREATE TYPE "ARAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "ARModule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "objectives" TEXT[],
    "modelUrl" TEXT NOT NULL,
    "modelHeightM" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "competencyId" TEXT NOT NULL,
    "courseId" TEXT,
    "kind" "ARModuleKind" NOT NULL DEFAULT 'FULL_LAB',
    "parentModuleId" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "durationMinutes" INTEGER NOT NULL DEFAULT 10,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "theoryWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isSimulation" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ARModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARComponent" (
    "id" TEXT NOT NULL,
    "arModuleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hotspotPosition" JSONB NOT NULL,
    "hotspotNormal" JSONB,
    "isInteractive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ARComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARTask" (
    "id" TEXT NOT NULL,
    "arModuleId" TEXT NOT NULL,
    "phase" "ARTaskPhase" NOT NULL DEFAULT 'TRAINING',
    "type" "ARTaskType" NOT NULL DEFAULT 'IDENTIFY',
    "position" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "hint" TEXT,
    "explanation" TEXT,
    "correctComponentId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "ARTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARPracticalAttempt" (
    "id" TEXT NOT NULL,
    "arModuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ARAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "practicalPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "theoryPercentage" DOUBLE PRECISION,
    "combinedPercentage" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "competencyBefore" DOUBLE PRECISION,
    "competencyAfter" DOUBLE PRECISION,

    CONSTRAINT "ARPracticalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARTaskResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "selectedComponentId" TEXT,
    "correct" BOOLEAN NOT NULL DEFAULT false,
    "pointsAwarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeMs" INTEGER,

    CONSTRAINT "ARTaskResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ARModule_key_key" ON "ARModule"("key");

-- CreateIndex
CREATE INDEX "ARModule_competencyId_idx" ON "ARModule"("competencyId");

-- CreateIndex
CREATE INDEX "ARModule_isPublished_position_idx" ON "ARModule"("isPublished", "position");

-- CreateIndex
CREATE INDEX "ARModule_kind_idx" ON "ARModule"("kind");

-- CreateIndex
CREATE INDEX "ARComponent_arModuleId_position_idx" ON "ARComponent"("arModuleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ARComponent_arModuleId_key_key" ON "ARComponent"("arModuleId", "key");

-- CreateIndex
CREATE INDEX "ARTask_arModuleId_phase_position_idx" ON "ARTask"("arModuleId", "phase", "position");

-- CreateIndex
CREATE INDEX "ARPracticalAttempt_userId_completedAt_idx" ON "ARPracticalAttempt"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "ARPracticalAttempt_arModuleId_completedAt_idx" ON "ARPracticalAttempt"("arModuleId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ARPracticalAttempt_arModuleId_userId_attemptNumber_key" ON "ARPracticalAttempt"("arModuleId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ARPracticalAttempt_userId_idempotencyKey_key" ON "ARPracticalAttempt"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ARTaskResponse_taskId_correct_idx" ON "ARTaskResponse"("taskId", "correct");

-- CreateIndex
CREATE UNIQUE INDEX "ARTaskResponse_attemptId_taskId_key" ON "ARTaskResponse"("attemptId", "taskId");

-- AddForeignKey
ALTER TABLE "ARModule" ADD CONSTRAINT "ARModule_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARModule" ADD CONSTRAINT "ARModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARModule" ADD CONSTRAINT "ARModule_parentModuleId_fkey" FOREIGN KEY ("parentModuleId") REFERENCES "ARModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARComponent" ADD CONSTRAINT "ARComponent_arModuleId_fkey" FOREIGN KEY ("arModuleId") REFERENCES "ARModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARTask" ADD CONSTRAINT "ARTask_arModuleId_fkey" FOREIGN KEY ("arModuleId") REFERENCES "ARModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARTask" ADD CONSTRAINT "ARTask_correctComponentId_fkey" FOREIGN KEY ("correctComponentId") REFERENCES "ARComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARPracticalAttempt" ADD CONSTRAINT "ARPracticalAttempt_arModuleId_fkey" FOREIGN KEY ("arModuleId") REFERENCES "ARModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARPracticalAttempt" ADD CONSTRAINT "ARPracticalAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARTaskResponse" ADD CONSTRAINT "ARTaskResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ARPracticalAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARTaskResponse" ADD CONSTRAINT "ARTaskResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ARTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARTaskResponse" ADD CONSTRAINT "ARTaskResponse_selectedComponentId_fkey" FOREIGN KEY ("selectedComponentId") REFERENCES "ARComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Value ranges the application relies on, enforced by the database as well as by Zod.
ALTER TABLE "ARModule"
  ADD CONSTRAINT "ARModule_passingScore_range" CHECK ("passingScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ARModule_theoryWeight_range" CHECK ("theoryWeight" BETWEEN 0 AND 1),
  ADD CONSTRAINT "ARModule_duration_positive" CHECK ("durationMinutes" > 0),
  ADD CONSTRAINT "ARModule_modelHeight_positive" CHECK ("modelHeightM" > 0);

ALTER TABLE "ARTask"
  ADD CONSTRAINT "ARTask_points_positive" CHECK ("points" > 0);

ALTER TABLE "ARPracticalAttempt"
  ADD CONSTRAINT "ARPracticalAttempt_practical_range" CHECK ("practicalPercentage" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ARPracticalAttempt_theory_range" CHECK ("theoryPercentage" IS NULL OR "theoryPercentage" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ARPracticalAttempt_combined_range" CHECK ("combinedPercentage" IS NULL OR "combinedPercentage" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ARPracticalAttempt_score_not_negative" CHECK ("score" >= 0),
  ADD CONSTRAINT "ARPracticalAttempt_hints_not_negative" CHECK ("hintsUsed" >= 0),
  ADD CONSTRAINT "ARPracticalAttempt_attemptNumber_positive" CHECK ("attemptNumber" > 0);

ALTER TABLE "ARTaskResponse"
  ADD CONSTRAINT "ARTaskResponse_points_not_negative" CHECK ("pointsAwarded" >= 0);
