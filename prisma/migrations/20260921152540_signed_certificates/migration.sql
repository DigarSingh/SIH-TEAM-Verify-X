-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signatureKeyId" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedCompetencies" TEXT[];
