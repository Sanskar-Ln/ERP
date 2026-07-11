-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'SALESPERSON', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('METAL', 'STONE', 'MAKING', 'ITEM');

-- CreateEnum
CREATE TYPE "MaterialForm" AS ENUM ('JEWELLERY', 'BULLION', 'LOOSE_ROUGH', 'LOOSE_POLISHED', 'IMITATION', 'SERVICE');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('TAX_INVOICE', 'ESTIMATE', 'DELIVERY_CHALLAN');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED', 'CANCELLED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "GstSplit" AS ENUM ('INTRA_STATE', 'INTER_STATE');

-- CreateEnum
CREATE TYPE "TaxKind" AS ENUM ('CGST', 'SGST', 'IGST');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_IN', 'SALE_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'EXCHANGE_IN', 'KARIGAR_ISSUE', 'KARIGAR_RECEIPT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CertificateLab" AS ENUM ('IGI', 'GIA', 'SGL', 'OTHER');

-- CreateEnum
CREATE TYPE "BarcodeSymbology" AS ENUM ('CODE128', 'DATAMATRIX');

-- CreateEnum
CREATE TYPE "MakingChargeType" AS ENUM ('FLAT', 'PER_GRAM', 'PERCENT_OF_METAL');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('FEED', 'MANUAL_FIX');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('IN_STOCK', 'SOLD', 'IN_TRANSIT', 'WITH_KARIGAR', 'SCRAPPED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "branchId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Metal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "karat" INTEGER,
    "finenessPpt" INTEGER NOT NULL,

    CONSTRAINT "Purity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoneType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDiamond" BOOLEAN NOT NULL,

    CONSTRAINT "StoneType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsnCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "HsnCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "form" "MaterialForm" NOT NULL,
    "isSetInJewellery" BOOLEAN NOT NULL,
    "invoiceMode" "DocType" NOT NULL,
    "hsnCodeId" TEXT,
    "rateBps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "stateCode" TEXT NOT NULL,
    "pincode" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "kycDocs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "gstin" TEXT,
    "stateCode" TEXT NOT NULL,
    "addressLine" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Karigar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "specialty" TEXT,

    CONSTRAINT "Karigar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetalRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metalId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "ratePaisePer10g" BIGINT NOT NULL,
    "source" "RateSource" NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "branchId" TEXT NOT NULL,
    "lotId" TEXT,
    "hsnCodeId" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "makingChargeType" "MakingChargeType" NOT NULL,
    "makingChargeValue" BIGINT NOT NULL,
    "isStudded" BOOLEAN NOT NULL DEFAULT false,
    "isPrecious" BOOLEAN NOT NULL DEFAULT true,
    "status" "ItemStatus" NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemMetalComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "metalId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "grossWeightG" DECIMAL(12,3) NOT NULL,
    "netWeightG" DECIMAL(12,3) NOT NULL,
    "wastageBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemMetalComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemStoneComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stoneTypeId" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "weightCt" DECIMAL(10,3) NOT NULL,
    "weightRatti" DECIMAL(10,2),
    "cut" TEXT,
    "color" TEXT,
    "clarity" TEXT,
    "certLab" "CertificateLab",
    "certNo" TEXT,
    "ratePaisePerCarat" BIGINT,
    "valuePaise" BIGINT NOT NULL,

    CONSTRAINT "ItemStoneComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "supplierId" TEXT,
    "karigarId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "branchId" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "grossWeightG" DECIMAL(12,3) NOT NULL,
    "refDocumentId" TEXT,
    "reversesId" TEXT,
    "note" TEXT,
    "actorUserId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "BranchTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTransferItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "BranchTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "symbology" "BarcodeSymbology" NOT NULL DEFAULT 'CODE128',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "symbology" "BarcodeSymbology" NOT NULL DEFAULT 'CODE128',
    "fields" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LabelTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tagIds" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabelBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSeries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seriesCode" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "NumberSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'ISSUED',
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerStateCode" TEXT NOT NULL,
    "placeOfSupplyStateCode" TEXT NOT NULL,
    "gstSplit" "GstSplit" NOT NULL,
    "subtotalPaise" BIGINT NOT NULL,
    "discountPaise" BIGINT NOT NULL,
    "exchangeValuePaise" BIGINT NOT NULL,
    "taxableValuePaise" BIGINT NOT NULL,
    "totalTaxPaise" BIGINT NOT NULL,
    "grandTotalPaise" BIGINT NOT NULL,
    "note" TEXT,
    "cancelReason" TEXT,
    "convertedFromId" TEXT,
    "supersedesId" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "metalValuePaise" BIGINT NOT NULL,
    "stoneValuePaise" BIGINT NOT NULL,
    "makingPaise" BIGINT NOT NULL,
    "makingDiscountPaise" BIGINT NOT NULL,
    "lineDiscountPaise" BIGINT NOT NULL,
    "grossPaise" BIGINT NOT NULL,
    "taxablePaise" BIGINT NOT NULL,
    "snapshot" JSONB,

    CONSTRAINT "DocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTaxLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "TaxKind" NOT NULL,
    "label" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "taxablePaise" BIGINT NOT NULL,
    "taxPaise" BIGINT NOT NULL,

    CONSTRAINT "DocumentTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OldGoldExchange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "metalId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "grossWeightG" DECIMAL(12,3) NOT NULL,
    "netWeightG" DECIMAL(12,3) NOT NULL,
    "ratePaisePer10g" BIGINT NOT NULL,
    "valuePaise" BIGINT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OldGoldExchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_at_idx" ON "AuditLog"("tenantId", "at");

-- CreateIndex
CREATE INDEX "Metal_tenantId_idx" ON "Metal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Metal_tenantId_code_key" ON "Metal"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Purity_tenantId_idx" ON "Purity"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Purity_tenantId_metalId_label_key" ON "Purity"("tenantId", "metalId", "label");

-- CreateIndex
CREATE INDEX "StoneType_tenantId_idx" ON "StoneType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StoneType_tenantId_code_key" ON "StoneType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "HsnCode_tenantId_idx" ON "HsnCode"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HsnCode_tenantId_code_key" ON "HsnCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_componentType_form_isSetInJewellery_invoic_idx" ON "TaxRule"("tenantId", "componentType", "form", "isSetInJewellery", "invoiceMode");

-- CreateIndex
CREATE INDEX "Customer_tenantId_phone_idx" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Customer_tenantId_name_idx" ON "Customer"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Karigar_tenantId_idx" ON "Karigar"("tenantId");

-- CreateIndex
CREATE INDEX "MetalRate_tenantId_metalId_purityId_effectiveAt_idx" ON "MetalRate"("tenantId", "metalId", "purityId", "effectiveAt" DESC);

-- CreateIndex
CREATE INDEX "Item_tenantId_branchId_status_idx" ON "Item"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Item_tenantId_itemCode_key" ON "Item"("tenantId", "itemCode");

-- CreateIndex
CREATE INDEX "ItemMetalComponent_tenantId_itemId_idx" ON "ItemMetalComponent"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "ItemStoneComponent_tenantId_itemId_idx" ON "ItemStoneComponent"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "Lot_tenantId_idx" ON "Lot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_tenantId_lotNo_key" ON "Lot"("tenantId", "lotNo");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement"("reversesId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_itemId_at_idx" ON "StockMovement"("tenantId", "itemId", "at");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_branchId_at_idx" ON "StockMovement"("tenantId", "branchId", "at");

-- CreateIndex
CREATE INDEX "BranchTransfer_tenantId_status_idx" ON "BranchTransfer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BranchTransferItem_tenantId_transferId_idx" ON "BranchTransferItem"("tenantId", "transferId");

-- CreateIndex
CREATE INDEX "Tag_tenantId_itemId_idx" ON "Tag"("tenantId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_tagCode_key" ON "Tag"("tenantId", "tagCode");

-- CreateIndex
CREATE UNIQUE INDEX "LabelTemplate_tenantId_name_key" ON "LabelTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LabelBatch_tenantId_createdAt_idx" ON "LabelBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSeries_tenantId_seriesCode_key" ON "NumberSeries"("tenantId", "seriesCode");

-- CreateIndex
CREATE UNIQUE INDEX "Document_convertedFromId_key" ON "Document"("convertedFromId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_supersedesId_key" ON "Document"("supersedesId");

-- CreateIndex
CREATE INDEX "Document_tenantId_customerId_issuedAt_idx" ON "Document"("tenantId", "customerId", "issuedAt");

-- CreateIndex
CREATE INDEX "Document_tenantId_docType_issuedAt_idx" ON "Document"("tenantId", "docType", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_docType_docNumber_key" ON "Document"("tenantId", "docType", "docNumber");

-- CreateIndex
CREATE INDEX "DocumentLine_tenantId_documentId_idx" ON "DocumentLine"("tenantId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLine_documentId_lineNo_key" ON "DocumentLine"("documentId", "lineNo");

-- CreateIndex
CREATE INDEX "DocumentTaxLine_tenantId_documentId_idx" ON "DocumentTaxLine"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "OldGoldExchange_tenantId_documentId_idx" ON "OldGoldExchange"("tenantId", "documentId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purity" ADD CONSTRAINT "Purity_metalId_fkey" FOREIGN KEY ("metalId") REFERENCES "Metal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_hsnCodeId_fkey" FOREIGN KEY ("hsnCodeId") REFERENCES "HsnCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemMetalComponent" ADD CONSTRAINT "ItemMetalComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStoneComponent" ADD CONSTRAINT "ItemStoneComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransferItem" ADD CONSTRAINT "BranchTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "BranchTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLine" ADD CONSTRAINT "DocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTaxLine" ADD CONSTRAINT "DocumentTaxLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OldGoldExchange" ADD CONSTRAINT "OldGoldExchange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
