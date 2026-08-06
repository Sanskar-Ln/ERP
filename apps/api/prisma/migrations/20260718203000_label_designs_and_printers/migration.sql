-- Label designs (rectangle + jewellery dumbbell tags) and printer profiles.

CREATE TYPE "TagShape" AS ENUM ('RECTANGLE', 'DUMBBELL');
CREATE TYPE "PrinterLanguage" AS ENUM ('ZPL', 'TSPL', 'HTML', 'AUTO');
CREATE TYPE "PrinterConnection" AS ENUM ('BROWSER', 'DOWNLOAD', 'NETWORK');

-- LabelTemplate gains a shape + dumbbell geometry, and its mm dimensions
-- become decimals (a 12.5mm flag is a real size on jewellery stock).
ALTER TABLE "LabelTemplate" ADD COLUMN "shape" "TagShape" NOT NULL DEFAULT 'RECTANGLE';
ALTER TABLE "LabelTemplate" ADD COLUMN "leftFlagMm" DECIMAL(6,2);
ALTER TABLE "LabelTemplate" ADD COLUMN "neckMm" DECIMAL(6,2);
ALTER TABLE "LabelTemplate" ADD COLUMN "rightFlagMm" DECIMAL(6,2);
ALTER TABLE "LabelTemplate" ALTER COLUMN "widthMm" TYPE DECIMAL(6,2);
ALTER TABLE "LabelTemplate" ALTER COLUMN "heightMm" TYPE DECIMAL(6,2);

-- Existing templates stored fields as a bare string array (["ITEM_CODE",…]).
-- Lift them to the placed-field shape { field, region, fontPt } so the layout
-- engine can read every historical template without a special case.
UPDATE "LabelTemplate"
SET "fields" = (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('field', elem, 'region', 'MAIN', 'fontPt', 6)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text("fields"::jsonb) AS elem
)::json
WHERE jsonb_typeof(("fields"::jsonb -> 0)) = 'string';

CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connection" "PrinterConnection" NOT NULL DEFAULT 'BROWSER',
    "language" "PrinterLanguage" NOT NULL DEFAULT 'AUTO',
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "detectedModel" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Printer_tenantId_name_key" ON "Printer"("tenantId", "name");
CREATE INDEX "Printer_tenantId_idx" ON "Printer"("tenantId");
