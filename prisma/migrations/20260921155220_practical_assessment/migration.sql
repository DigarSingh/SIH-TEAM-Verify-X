-- CreateEnum
CREATE TYPE "ScenarioStepType" AS ENUM ('IDENTIFY', 'INTERPRET', 'ACTION');

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "mcqWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.6;

-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "mcqPercentage" DOUBLE PRECISION,
ADD COLUMN     "practicalPercentage" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PracticalScenario" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "briefing" TEXT NOT NULL,
    "imageUrl" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 10,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticalScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalScenarioStep" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "type" "ScenarioStepType" NOT NULL DEFAULT 'INTERPRET',
    "prompt" TEXT NOT NULL,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "PracticalScenarioStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalScenarioOption" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PracticalScenarioOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticalResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "creditAwarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marksAwarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticalResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticalScenario_assessmentId_position_idx" ON "PracticalScenario"("assessmentId", "position");

-- CreateIndex
CREATE INDEX "PracticalScenarioStep_scenarioId_position_idx" ON "PracticalScenarioStep"("scenarioId", "position");

-- CreateIndex
CREATE INDEX "PracticalScenarioOption_stepId_position_idx" ON "PracticalScenarioOption"("stepId", "position");

-- CreateIndex
CREATE INDEX "PracticalResponse_scenarioId_idx" ON "PracticalResponse"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticalResponse_attemptId_stepId_key" ON "PracticalResponse"("attemptId", "stepId");

-- AddForeignKey
ALTER TABLE "PracticalScenario" ADD CONSTRAINT "PracticalScenario_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalScenarioStep" ADD CONSTRAINT "PracticalScenarioStep_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "PracticalScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalScenarioOption" ADD CONSTRAINT "PracticalScenarioOption_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PracticalScenarioStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalResponse" ADD CONSTRAINT "PracticalResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalResponse" ADD CONSTRAINT "PracticalResponse_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "PracticalScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalResponse" ADD CONSTRAINT "PracticalResponse_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PracticalScenarioStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticalResponse" ADD CONSTRAINT "PracticalResponse_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "PracticalScenarioOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Weighting and credit are shares; marks are positive.
ALTER TABLE "Assessment"
  ADD CONSTRAINT "Assessment_mcqWeight_range" CHECK ("mcqWeight" BETWEEN 0 AND 1);

ALTER TABLE "PracticalScenario"
  ADD CONSTRAINT "PracticalScenario_marks_positive" CHECK ("marks" > 0);

ALTER TABLE "PracticalScenarioStep"
  ADD CONSTRAINT "PracticalScenarioStep_marks_positive" CHECK ("marks" > 0);

ALTER TABLE "PracticalScenarioOption"
  ADD CONSTRAINT "PracticalScenarioOption_credit_range" CHECK ("credit" BETWEEN 0 AND 1);
