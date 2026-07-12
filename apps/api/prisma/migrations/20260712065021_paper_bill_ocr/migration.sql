-- AlterTable
ALTER TABLE "PaperBill" ADD COLUMN     "extracted" JSONB,
ADD COLUMN     "extractedAt" TIMESTAMP(3);
