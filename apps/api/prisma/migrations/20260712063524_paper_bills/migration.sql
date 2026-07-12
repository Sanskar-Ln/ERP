-- CreateTable
CREATE TABLE "PaperBill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "note" TEXT,
    "billDate" TIMESTAMP(3),
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperBill_tenantId_customerId_uploadedAt_idx" ON "PaperBill"("tenantId", "customerId", "uploadedAt" DESC);

-- AddForeignKey
ALTER TABLE "PaperBill" ADD CONSTRAINT "PaperBill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
