-- CreateEnum
CREATE TYPE "CareerLevel" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "MentorshipStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "careerLevel" "CareerLevel",
ADD COLUMN     "retirementDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Mentorship" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "menteeId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "status" "MentorshipStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mentorship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mentorship_menteeId_status_idx" ON "Mentorship"("menteeId", "status");

-- CreateIndex
CREATE INDEX "Mentorship_competencyId_status_idx" ON "Mentorship"("competencyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Mentorship_mentorId_menteeId_competencyId_key" ON "Mentorship"("mentorId", "menteeId", "competencyId");

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A mentorship must be between two different people, and its dates must make sense.
ALTER TABLE "Mentorship"
  ADD CONSTRAINT "Mentorship_distinct_people" CHECK ("mentorId" <> "menteeId"),
  ADD CONSTRAINT "Mentorship_completed_after_start" CHECK ("completedAt" IS NULL OR "startedAt" IS NULL OR "completedAt" >= "startedAt");
