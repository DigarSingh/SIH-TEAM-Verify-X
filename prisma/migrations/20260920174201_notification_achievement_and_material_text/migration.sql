-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACHIEVEMENT';

-- AlterTable
ALTER TABLE "LearningMaterial" ADD COLUMN     "extractedText" TEXT;
