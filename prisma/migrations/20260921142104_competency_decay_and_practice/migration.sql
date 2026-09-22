-- CreateEnum
CREATE TYPE "PracticeSource" AS ENUM ('COURSE_COMPLETION', 'ASSESSMENT', 'TRAINER_EVALUATION', 'OPERATIONAL_DUTY', 'REFRESHER', 'MANUAL_ENTRY');

-- AlterTable
ALTER TABLE "EmployeeCompetency" ADD COLUMN     "lastPracticedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompetencyDecayPolicy" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "decayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "halfLifeDays" INTEGER NOT NULL DEFAULT 180,
    "minimumSafeLevel" INTEGER NOT NULL DEFAULT 40,
    "recertificationIntervalDays" INTEGER NOT NULL DEFAULT 365,
    "criticality" INTEGER NOT NULL DEFAULT 3,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyDecayPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyPracticeRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "practicedAt" TIMESTAMP(3) NOT NULL,
    "source" "PracticeSource" NOT NULL,
    "note" TEXT,
    "courseId" TEXT,
    "attemptId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyPracticeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyDecayPolicy_competencyId_key" ON "CompetencyDecayPolicy"("competencyId");

-- CreateIndex
CREATE INDEX "CompetencyPracticeRecord_userId_competencyId_practicedAt_idx" ON "CompetencyPracticeRecord"("userId", "competencyId", "practicedAt");

-- CreateIndex
CREATE INDEX "CompetencyPracticeRecord_competencyId_practicedAt_idx" ON "CompetencyPracticeRecord"("competencyId", "practicedAt");

-- AddForeignKey
ALTER TABLE "CompetencyDecayPolicy" ADD CONSTRAINT "CompetencyDecayPolicy_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyDecayPolicy" ADD CONSTRAINT "CompetencyDecayPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyPracticeRecord" ADD CONSTRAINT "CompetencyPracticeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyPracticeRecord" ADD CONSTRAINT "CompetencyPracticeRecord_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyPracticeRecord" ADD CONSTRAINT "CompetencyPracticeRecord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyPracticeRecord" ADD CONSTRAINT "CompetencyPracticeRecord_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyPracticeRecord" ADD CONSTRAINT "CompetencyPracticeRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Range constraints, in the same style as the data-integrity migration: the decay
-- model only makes sense with a positive half-life and levels on the 0..100 scale.
ALTER TABLE "CompetencyDecayPolicy"
  ADD CONSTRAINT "CompetencyDecayPolicy_halfLifeDays_positive" CHECK ("halfLifeDays" > 0),
  ADD CONSTRAINT "CompetencyDecayPolicy_minimumSafeLevel_range" CHECK ("minimumSafeLevel" BETWEEN 0 AND 100),
  ADD CONSTRAINT "CompetencyDecayPolicy_recertification_nonnegative" CHECK ("recertificationIntervalDays" >= 0),
  ADD CONSTRAINT "CompetencyDecayPolicy_criticality_range" CHECK ("criticality" BETWEEN 1 AND 5);
