-- CreateEnum
CREATE TYPE "HazardType" AS ENUM ('MONSOON', 'CYCLONE', 'HEATWAVE', 'FLOOD', 'WINTER', 'THUNDERSTORM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReadinessEventStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReadinessAssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED');

-- CreateTable
CREATE TABLE "ReadinessEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "hazardType" "HazardType" NOT NULL DEFAULT 'OTHER',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "status" "ReadinessEventStatus" NOT NULL DEFAULT 'PLANNED',
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessRequirement" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 70,
    "importance" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "ReadinessRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessEventDepartment" (
    "eventId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "ReadinessEventDepartment_pkey" PRIMARY KEY ("eventId","departmentId")
);

-- CreateTable
CREATE TABLE "ReadinessAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competencyId" TEXT,
    "courseId" TEXT,
    "status" "ReadinessAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "assignedById" TEXT,

    CONSTRAINT "ReadinessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReadinessEvent_startDate_idx" ON "ReadinessEvent"("startDate");

-- CreateIndex
CREATE INDEX "ReadinessEvent_status_startDate_idx" ON "ReadinessEvent"("status", "startDate");

-- CreateIndex
CREATE INDEX "ReadinessRequirement_competencyId_idx" ON "ReadinessRequirement"("competencyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessRequirement_eventId_competencyId_key" ON "ReadinessRequirement"("eventId", "competencyId");

-- CreateIndex
CREATE INDEX "ReadinessEventDepartment_departmentId_idx" ON "ReadinessEventDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "ReadinessAssignment_userId_status_idx" ON "ReadinessAssignment"("userId", "status");

-- CreateIndex
CREATE INDEX "ReadinessAssignment_eventId_status_idx" ON "ReadinessAssignment"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessAssignment_eventId_userId_competencyId_key" ON "ReadinessAssignment"("eventId", "userId", "competencyId");

-- AddForeignKey
ALTER TABLE "ReadinessEvent" ADD CONSTRAINT "ReadinessEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessRequirement" ADD CONSTRAINT "ReadinessRequirement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ReadinessEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessRequirement" ADD CONSTRAINT "ReadinessRequirement_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessEventDepartment" ADD CONSTRAINT "ReadinessEventDepartment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ReadinessEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessEventDepartment" ADD CONSTRAINT "ReadinessEventDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssignment" ADD CONSTRAINT "ReadinessAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ReadinessEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssignment" ADD CONSTRAINT "ReadinessAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssignment" ADD CONSTRAINT "ReadinessAssignment_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssignment" ADD CONSTRAINT "ReadinessAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessAssignment" ADD CONSTRAINT "ReadinessAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An event must end after it starts, and the scales stay bounded.
ALTER TABLE "ReadinessEvent"
  ADD CONSTRAINT "ReadinessEvent_dates_ordered" CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "ReadinessEvent_priority_range" CHECK ("priority" BETWEEN 1 AND 5);

ALTER TABLE "ReadinessRequirement"
  ADD CONSTRAINT "ReadinessRequirement_requiredLevel_range" CHECK ("requiredLevel" BETWEEN 0 AND 100),
  ADD CONSTRAINT "ReadinessRequirement_importance_range" CHECK ("importance" BETWEEN 1 AND 5);
