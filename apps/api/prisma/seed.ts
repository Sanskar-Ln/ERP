/**
 * Seed — demo tenant with the full master-data set, including the
 * 2026 India GST defaults for the tax-rule matrix (PLAN.md table).
 *
 * Idempotent-ish: skips if the demo tenant already exists.
 * Run: pnpm --filter @erp/api seed
 *
 * Demo logins (password for all: demo1234):
 *   owner@demo.in / manager@demo.in / sales@demo.in / accounts@demo.in
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as newId } from 'uuid';

const prisma = new PrismaClient();

const DEMO_TENANT_NAME = 'Demo Jewellers Pvt Ltd';

async function main(): Promise<void> {
  const existing = await prisma.tenant.findFirst({ where: { name: DEMO_TENANT_NAME } });
  if (existing) {
    console.log(`Seed skipped — "${DEMO_TENANT_NAME}" already exists (${existing.id})`);
    return;
  }

  const tenantId = newId();
  // Maharashtra (27) HQ + Karnataka (29) branch → exercises IGST paths.
  const hqId = newId();
  const brId = newId();

  await prisma.tenant.create({
    data: { id: tenantId, name: DEMO_TENANT_NAME, stateCode: '27', gstin: '27AAACD1234F1Z5' },
  });
  await prisma.branch.createMany({
    data: [
      { id: hqId, tenantId, code: 'HQ', name: 'Mumbai Flagship', stateCode: '27', gstin: '27AAACD1234F1Z5' },
      { id: brId, tenantId, code: 'BLR', name: 'Bengaluru Store', stateCode: '29', gstin: '29AAACD1234F1Z9' },
    ],
  });

  const hash = await bcrypt.hash('demo1234', 10);
  await prisma.user.createMany({
    data: [
      { id: newId(), tenantId, email: 'owner@demo.in', name: 'Demo Owner', passwordHash: hash, role: 'OWNER', branchId: hqId },
      { id: newId(), tenantId, email: 'manager@demo.in', name: 'Demo Manager', passwordHash: hash, role: 'MANAGER', branchId: hqId },
      { id: newId(), tenantId, email: 'sales@demo.in', name: 'Demo Sales', passwordHash: hash, role: 'SALESPERSON', branchId: hqId },
      { id: newId(), tenantId, email: 'accounts@demo.in', name: 'Demo Accountant', passwordHash: hash, role: 'ACCOUNTANT', branchId: hqId },
    ],
  });

  // ---------------------------------------------------------- metals & purities
  const goldId = newId();
  const silverId = newId();
  await prisma.metal.createMany({
    data: [
      { id: goldId, tenantId, code: 'GOLD', name: 'Gold' },
      { id: silverId, tenantId, code: 'SILVER', name: 'Silver' },
    ],
  });
  const g24 = newId(), g22 = newId(), g18 = newId(), s925 = newId();
  await prisma.purity.createMany({
    data: [
      { id: g24, tenantId, metalId: goldId, label: '24K', karat: 24, finenessPpt: 999 },
      { id: g22, tenantId, metalId: goldId, label: '22K', karat: 22, finenessPpt: 916 },
      { id: g18, tenantId, metalId: goldId, label: '18K', karat: 18, finenessPpt: 750 },
      { id: s925, tenantId, metalId: silverId, label: '925', karat: null, finenessPpt: 925 },
    ],
  });

  // ---------------------------------------------------------- stone types
  await prisma.stoneType.createMany({
    data: [
      { id: newId(), tenantId, code: 'DIAMOND', name: 'Diamond', isDiamond: true },
      { id: newId(), tenantId, code: 'RUBY', name: 'Ruby', isDiamond: false },
      { id: newId(), tenantId, code: 'EMERALD', name: 'Emerald', isDiamond: false },
      { id: newId(), tenantId, code: 'BLUE_SAPPHIRE', name: 'Blue Sapphire (Neelam)', isDiamond: false },
    ],
  });

  // ---------------------------------------------------------- HSN codes
  const hsn = async (code: string, description: string) => {
    const id = newId();
    await prisma.hsnCode.create({ data: { id, tenantId, code, description } });
    return id;
  };
  const h7113 = await hsn('7113', 'Articles of jewellery of precious metal');
  const h7106 = await hsn('7106', 'Silver (unwrought or semi-manufactured)');
  const h7108 = await hsn('7108', 'Gold (unwrought or semi-manufactured)');
  const h7102 = await hsn('7102', 'Diamonds, whether or not worked');
  const h7117 = await hsn('7117', 'Imitation jewellery');
  const h9988 = await hsn('9988', 'Job work / manufacturing services (making charges)');

  // ---------------------------------------------------------- tax matrix
  // India 2026 defaults — DATA, not code. Rates in basis points.
  const from = new Date('2026-01-01T00:00:00.000Z');
  type RuleSeed = [componentType: string, form: string, set: boolean, rateBps: number, hsnCodeId: string | null, note: string];
  const rules: RuleSeed[] = [
    ['METAL', 'JEWELLERY', false, 300, h7113, 'Gold/silver jewellery metal value — 3% (HSN 7113)'],
    ['METAL', 'BULLION', false, 300, h7108, 'Gold bullion — 3% (HSN 7108)'],
    ['MAKING', 'SERVICE', false, 500, h9988, 'Making charges itemized — 5% (SAC 9988)'],
    ['STONE', 'LOOSE_ROUGH', false, 25, h7102, 'Rough diamonds — 0.25% (HSN 7102)'],
    ['STONE', 'LOOSE_POLISHED', false, 150, h7102, 'Cut & polished diamonds — 1.5% (HSN 7102)'],
    ['STONE', 'LOOSE_POLISHED', true, 300, h7113, 'Stone set in jewellery rides composite 3%'],
    ['ITEM', 'JEWELLERY', true, 300, h7113, 'Studded jewellery composite — 3% on full value'],
    ['ITEM', 'JEWELLERY', false, 300, h7113, 'Plain jewellery sold as one value — 3%'],
    ['ITEM', 'IMITATION', false, 1800, h7117, 'Imitation jewellery — 18% (HSN 7117)'],
  ];
  await prisma.taxRule.createMany({
    data: rules.map(([componentType, form, isSetInJewellery, rateBps, hsnCodeId, note]) => ({
      id: newId(),
      tenantId,
      componentType: componentType as never,
      form: form as never,
      isSetInJewellery,
      invoiceMode: 'TAX_INVOICE' as never,
      hsnCodeId,
      rateBps,
      effectiveFrom: from,
      effectiveTo: null,
      note,
    })),
  });

  // ---------------------------------------------------------- parties
  await prisma.customer.create({
    data: {
      id: newId(),
      tenantId,
      name: 'Asha Mehta',
      phone: '+919820012345',
      stateCode: '27',
      pan: 'ABCPM1234F',
      kycDocs: [{ docType: 'PAN', docNumber: 'ABCPM1234F' }],
    },
  });
  await prisma.customer.create({
    data: { id: newId(), tenantId, name: 'Rohan Iyer (Bengaluru)', phone: '+919845098450', stateCode: '29', kycDocs: [] },
  });
  await prisma.supplier.create({
    data: { id: newId(), tenantId, name: 'Zaveri Bazaar Bullion Co', stateCode: '27', gstin: '27AABCZ9876K1Z2' },
  });
  await prisma.karigar.create({
    data: { id: newId(), tenantId, name: 'Suresh Karigar', specialty: 'Temple jewellery' },
  });

  // ---------------------------------------------------------- metal rates
  // Board rates (paise per 10 g): gold 24K ₹1,00,000; 22K ₹92,000;
  // 18K ₹75,000; silver 925 ₹1,050.
  const now = new Date();
  await prisma.metalRate.createMany({
    data: [
      { id: newId(), tenantId, metalId: goldId, purityId: g24, ratePaisePer10g: 10_000_000n, source: 'MANUAL_FIX', effectiveAt: now },
      { id: newId(), tenantId, metalId: goldId, purityId: g22, ratePaisePer10g: 9_200_000n, source: 'MANUAL_FIX', effectiveAt: now },
      { id: newId(), tenantId, metalId: goldId, purityId: g18, ratePaisePer10g: 7_500_000n, source: 'MANUAL_FIX', effectiveAt: now },
      { id: newId(), tenantId, metalId: silverId, purityId: s925, ratePaisePer10g: 105_000n, source: 'MANUAL_FIX', effectiveAt: now },
    ],
  });

  console.log(`Seeded "${DEMO_TENANT_NAME}" (tenant ${tenantId})`);
  console.log('Logins: owner@demo.in / manager@demo.in / sales@demo.in / accounts@demo.in — password demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
