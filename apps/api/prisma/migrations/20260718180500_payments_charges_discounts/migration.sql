-- Phase A (money completeness): payments, extra charges, discount caps,
-- customer-specific rates, item categories + RESERVED status.

-- New movement kinds: zero-quantity reservation annotations.
ALTER TYPE "MovementType" ADD VALUE 'RESERVE';
ALTER TYPE "MovementType" ADD VALUE 'UNRESERVE';

-- Reserved stock: physically on hand, held for a customer/order.
ALTER TYPE "ItemStatus" ADD VALUE 'RESERVED';

-- Payment enums.
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');

-- Append-only payment ledger against documents.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "mode" "PaymentMode" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_tenantId_documentId_idx" ON "Payment"("tenantId", "documentId");
CREATE INDEX "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant-level OPS discount cap (bps of subtotal; ADMIN unrestricted).
ALTER TABLE "Tenant" ADD COLUMN "opsMaxDiscountBps" INTEGER NOT NULL DEFAULT 200;

-- Customer-specific rate adjustment (signed bps on the board rate).
ALTER TABLE "Customer" ADD COLUMN "rateAdjustBps" INTEGER NOT NULL DEFAULT 0;

-- Item: classification, flat extra charges, hallmark metadata.
ALTER TABLE "Item" ADD COLUMN "category" TEXT;
ALTER TABLE "Item" ADD COLUMN "subCategory" TEXT;
ALTER TABLE "Item" ADD COLUMN "hallmarkChargePaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "packingChargePaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "otherChargePaise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "hallmarkNo" TEXT;
ALTER TABLE "Item" ADD COLUMN "hallmarkAgency" TEXT;

-- Document line: frozen extra charges at issue time.
ALTER TABLE "DocumentLine" ADD COLUMN "extraChargesPaise" BIGINT NOT NULL DEFAULT 0;
