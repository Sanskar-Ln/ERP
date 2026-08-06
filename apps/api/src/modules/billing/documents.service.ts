/**
 * DocumentsService — the document engine.
 *
 * ONE cart shape produces all three document types (Tax Invoice, Estimate/
 * Cash Memo, Delivery Challan). Issue, conversion and cancellation each run
 * in a single tenant-scoped transaction that writes the document, its
 * lines/tax lines/exchanges, the stock effects and the audit row together.
 *
 * IMMUTABILITY: documents are never edited after issue. Status transitions
 * (CONVERTED, CANCELLED) never change financial content; corrections are
 * successor documents. Every pricing input is frozen in the line `snapshot`
 * JSON so a document remains reproducible after masters change.
 *
 * Domain boundaries: pricing math is domain/pricing, GST math is
 * domain/billing — this service only orchestrates I/O around them.
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  applyBps,
  Cart,
  DiscountType,
  DocStatus,
  DocType,
  gramsToMg,
  ItemStatus,
  MakingChargeType,
  mgToGrams,
  MovementType,
  newId,
  Role,
  roundDiv,
  type DiscountSpec,
  type JwtClaims,
} from '@erp/shared';
import { TenancyService, type TenantTx } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { priceItem, oldGoldValuePaise } from '../../domain/pricing/price-item';
import { computeGst, type GstLineInput } from '../../domain/billing/gst-engine';
import type { TaxRuleRow } from '../../domain/tax/resolve-tax-rule';
import { signedQuantities } from '../../domain/inventory/movement-rules';
import { allocate } from '@erp/shared';
import { nextDocNumber } from './number-series';

/** Resolve a flat/percent discount spec against its base value, in paise. */
const resolveDiscount = (spec: DiscountSpec | undefined, basePaise: number): number =>
  spec == null ? 0 : spec.type === DiscountType.FLAT ? spec.value : applyBps(basePaise, spec.value);

/** Statuses a line item may be in to be billable on an invoice/challan. */
const SELLABLE = new Set<string>([ItemStatus.IN_STOCK, ItemStatus.RESERVED]);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Issue a document from a cart. The whole flow is one transaction. */
  async issue(user: JwtClaims, docType: DocType, cart: Cart) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();

    return db.$transaction(async (tx) => {
      // ---------- load the world (all reads tenant-scoped) ----------
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: cart.customerId } });
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: cart.branchId } });
      const placeOfSupply = cart.placeOfSupplyStateCode ?? customer.stateCode;

      const items = await tx.item.findMany({
        where: { id: { in: cart.lines.map((l) => l.itemId) } },
        include: { metalComponents: true, stoneComponents: true },
      });
      const itemById = new Map(items.map((i) => [i.id, i]));
      const hsnRows = await tx.hsnCode.findMany({ where: { id: { in: items.map((i) => i.hsnCodeId) } } });
      const hsnById = new Map(hsnRows.map((h) => [h.id, h.code]));
      const matrix = (await tx.taxRule.findMany()) as unknown as TaxRuleRow[];

      // ---------- price every line (pure domain) ----------
      interface PricedLine {
        lineNo: number;
        itemId: string;
        description: string;
        hsnCode: string;
        pieces: number;
        pricing: ReturnType<typeof priceItem>;
        isStudded: boolean;
        isPrecious: boolean;
        snapshot: unknown;
      }
      const priced: PricedLine[] = [];
      let lineNo = 0;

      for (const line of cart.lines) {
        const item = itemById.get(line.itemId);
        if (!item) throw new NotFoundException(`item ${line.itemId} not found`);
        if (docType !== DocType.ESTIMATE) {
          // Estimates may quote items anywhere; invoices/challans move stock.
          // RESERVED items are sellable — selling is what the hold was FOR.
          if (!SELLABLE.has(item.status)) {
            throw new BadRequestException(`item ${item.itemCode} is not in stock (${item.status})`);
          }
          if (item.branchId !== cart.branchId) {
            throw new BadRequestException(`item ${item.itemCode} is not at the billing branch`);
          }
        }

        // Resolve a board rate for every metal component (or the line override).
        // CUSTOMER-SPECIFIC RATE: the customer's signed bps adjustment shifts
        // the BOARD rate (−100 = 1% concession); explicit overrides win as-is.
        const metalInputs = [];
        const rateSnapshots = [];
        for (const mc of item.metalComponents) {
          let ratePaisePer10g: number;
          let boardRatePaisePer10g: number | null = null;
          if (line.metalRatePaisePer10gOverride != null) {
            ratePaisePer10g = line.metalRatePaisePer10gOverride;
          } else {
            const rate = await tx.metalRate.findFirst({
              where: { metalId: mc.metalId, purityId: mc.purityId, effectiveAt: { lte: now } },
              orderBy: { effectiveAt: 'desc' },
            });
            if (!rate) {
              throw new BadRequestException(
                `no board rate for metal ${mc.metalId} purity ${mc.purityId} — fix a rate first`,
              );
            }
            boardRatePaisePer10g = Number(rate.ratePaisePer10g);
            ratePaisePer10g = boardRatePaisePer10g + roundDiv(boardRatePaisePer10g * customer.rateAdjustBps, 10_000);
          }
          metalInputs.push({
            netWeightMg: gramsToMg(mc.netWeightG.toFixed(3)),
            wastageBps: mc.wastageBps,
            ratePaisePer10g,
          });
          rateSnapshots.push({
            metalId: mc.metalId,
            purityId: mc.purityId,
            grossWeightG: mc.grossWeightG.toFixed(3),
            netWeightG: mc.netWeightG.toFixed(3),
            wastageBps: mc.wastageBps,
            ratePaisePer10g,
            boardRatePaisePer10g,
            customerRateAdjustBps: customer.rateAdjustBps,
            rateOverridden: line.metalRatePaisePer10gOverride != null,
          });
        }

        const extraChargesPaise =
          Number(item.hallmarkChargePaise) + Number(item.packingChargePaise) + Number(item.otherChargePaise);
        const pricing = priceItem({
          pieces: item.pieces,
          metalComponents: metalInputs,
          stoneValuesPaise: item.stoneComponents.map((sc) => Number(sc.valuePaise)),
          making: { type: item.makingChargeType as MakingChargeType, value: Number(item.makingChargeValue) },
          makingDiscountPaise: line.makingDiscountPaise,
          extraChargesPaise,
        });

        lineNo += 1;
        priced.push({
          lineNo,
          itemId: item.id,
          description: `${item.name} [${item.itemCode}]`,
          hsnCode: hsnById.get(item.hsnCodeId) ?? '',
          pieces: item.pieces,
          pricing,
          isStudded: item.isStudded,
          isPrecious: item.isPrecious,
          // The reproducibility snapshot: every pricing input, frozen.
          snapshot: {
            metalComponents: rateSnapshots,
            stones: item.stoneComponents.map((sc) => ({
              stoneTypeId: sc.stoneTypeId,
              pieces: sc.pieces,
              weightCt: sc.weightCt.toFixed(3),
              certLab: sc.certLab,
              certNo: sc.certNo,
              valuePaise: Number(sc.valuePaise),
            })),
            making: { type: item.makingChargeType, value: Number(item.makingChargeValue) },
            makingDiscountPaise: line.makingDiscountPaise,
            extraCharges: {
              hallmarkPaise: Number(item.hallmarkChargePaise),
              packingPaise: Number(item.packingChargePaise),
              otherPaise: Number(item.otherChargePaise),
            },
            lineDiscount: line.discount ?? null,
            pricedAt: now.toISOString(),
          },
        });
      }

      // ---------- old-gold exchanges (pure valuation) ----------
      const exchanges = cart.oldGoldExchanges.map((ex) => {
        const netMg = gramsToMg(ex.netWeightG);
        const grossMg = gramsToMg(ex.grossWeightG);
        if (netMg > grossMg) throw new BadRequestException('old-gold net weight exceeds gross');
        return { ...ex, valuePaise: oldGoldValuePaise(netMg, ex.ratePaisePer10g) };
      });
      const exchangeTotal = exchanges.reduce((s, e) => s + e.valuePaise, 0);

      // ---------- resolve discounts (line-level + cart-level) ----------
      // Each line may carry its own flat/percent discount; the cart-level
      // discount (flat/percent `discount` spec, or the legacy paise field)
      // is then prorated across what remains of each line.
      const lineGross = priced.map((p) => p.pricing.grossPaise);
      const ownDiscounts = cart.lines.map((l, i) => Math.min(resolveDiscount(l.discount, lineGross[i]!), lineGross[i]!));
      const grossAfterOwn = lineGross.map((g, i) => g - ownDiscounts[i]!);
      const subtotal = lineGross.reduce((a, b) => a + b, 0);
      const cartDiscountRequested = cart.discount ? resolveDiscount(cart.discount, subtotal) : cart.cartDiscountPaise;
      const cartDiscount = Math.min(cartDiscountRequested, grossAfterOwn.reduce((a, b) => a + b, 0));
      const cartShares =
        cartDiscount > 0 && priced.length > 0 ? allocate(cartDiscount, grossAfterOwn) : priced.map(() => 0);
      const lineDiscounts = ownDiscounts.map((own, i) => own + cartShares[i]!);

      // ---------- RBAC discount cap ----------
      // OPS may discount up to the tenant's cap (bps of the pre-discount
      // value, making discounts included); ADMIN is unrestricted. Enforced
      // HERE, server-side — the UI hint is a courtesy, not the control.
      if (user.role !== Role.ADMIN) {
        const makingDiscounts = priced.reduce((s, p) => s + p.pricing.makingDiscountAppliedPaise, 0);
        const totalDiscount = lineDiscounts.reduce((a, b) => a + b, 0) + makingDiscounts;
        const base = subtotal + makingDiscounts;
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
        const cap = applyBps(base, tenant.opsMaxDiscountBps);
        if (totalDiscount > cap) {
          throw new ForbiddenException(
            `discount ₹${(totalDiscount / 100).toFixed(2)} exceeds your limit of ` +
              `${(tenant.opsMaxDiscountBps / 100).toFixed(2)}% (₹${(cap / 100).toFixed(2)}) — ask an admin`,
          );
        }
      }

      // ---------- GST (pure domain engine) ----------
      // Extra charges (hallmark/packing/other) are ancillary services — they
      // ride the making/service component through the engine.
      const gstLines: GstLineInput[] = priced.map((p, i) => ({
        lineNo: p.lineNo,
        metalValuePaise: p.pricing.metalValuePaise,
        stoneValuePaise: p.pricing.stoneValuePaise,
        makingPaise: p.pricing.makingPaise + p.pricing.extraChargesPaise,
        lineDiscountPaise: lineDiscounts[i]!,
        isStudded: p.isStudded,
        isPrecious: p.isPrecious,
      }));
      const gst = computeGst({
        invoiceMode: docType,
        lines: gstLines,
        matrix,
        sellerStateCode: branch.stateCode,
        placeOfSupplyStateCode: placeOfSupply,
        exchangeValuePaise: exchangeTotal,
        at: now,
      });

      // ---------- persist the document graph ----------
      const docId = newId();
      const docNumber = await nextDocNumber(tx, user.tenantId, docType, now);
      const doc = await tx.document.create({
        data: {
          id: docId,
          tenantId: user.tenantId,
          docType,
          docNumber,
          status: DocStatus.ISSUED,
          branchId: branch.id,
          customerId: customer.id,
          issuedAt: now,
          sellerStateCode: branch.stateCode,
          placeOfSupplyStateCode: placeOfSupply,
          gstSplit: gst.gstSplit,
          subtotalPaise: BigInt(gst.subtotalPaise),
          discountPaise: BigInt(gst.discountPaise),
          exchangeValuePaise: BigInt(gst.exchangeValuePaise),
          taxableValuePaise: BigInt(gst.taxableValuePaise),
          totalTaxPaise: BigInt(gst.totalTaxPaise),
          grandTotalPaise: BigInt(gst.grandTotalPaise),
          note: cart.note ?? null,
          createdByUserId: user.sub,
          lines: {
            create: priced.map((p, i) => ({
              id: newId(),
              tenantId: user.tenantId,
              lineNo: p.lineNo,
              itemId: p.itemId,
              description: p.description,
              hsnCode: p.hsnCode,
              pieces: p.pieces,
              metalValuePaise: BigInt(p.pricing.metalValuePaise),
              stoneValuePaise: BigInt(p.pricing.stoneValuePaise),
              makingPaise: BigInt(p.pricing.makingPaise),
              extraChargesPaise: BigInt(p.pricing.extraChargesPaise),
              makingDiscountPaise: BigInt(p.pricing.makingDiscountAppliedPaise),
              lineDiscountPaise: BigInt(lineDiscounts[i]!),
              grossPaise: BigInt(p.pricing.grossPaise - lineDiscounts[i]!),
              taxablePaise: BigInt(gst.lineTaxablePaise.get(p.lineNo) ?? 0),
              snapshot: p.snapshot as never,
            })),
          },
          taxLines: {
            create: gst.taxBuckets.map((b) => ({
              id: newId(),
              tenantId: user.tenantId,
              kind: b.kind,
              label: b.label,
              rateBps: b.rateBps,
              taxablePaise: BigInt(b.taxablePaise),
              taxPaise: BigInt(b.taxPaise),
            })),
          },
          exchanges: {
            create: exchanges.map((ex) => ({
              id: newId(),
              tenantId: user.tenantId,
              metalId: ex.metalId,
              purityId: ex.purityId,
              grossWeightG: ex.grossWeightG,
              netWeightG: ex.netWeightG,
              ratePaisePer10g: BigInt(ex.ratePaisePer10g),
              valuePaise: BigInt(ex.valuePaise),
              note: ex.note ?? null,
            })),
          },
        },
        include: { lines: true, taxLines: true, exchanges: true },
      });

      // ---------- stock effects: only a Tax Invoice transfers goods ----------
      if (docType === DocType.TAX_INVOICE) {
        await this.postSaleMovements(tx, user, doc.id, priced, cart.branchId);
      }

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Document',
        entityId: docId,
        action: 'ISSUE',
        after: {
          docType,
          docNumber,
          grandTotalPaise: gst.grandTotalPaise,
          totalTaxPaise: gst.totalTaxPaise,
          warnings: gst.warnings,
        },
      });

      return { ...doc, warnings: gst.warnings };
    });
  }

  /** SALE_OUT + item→SOLD for every invoiced line. */
  private async postSaleMovements(
    tx: TenantTx,
    user: JwtClaims,
    documentId: string,
    priced: { itemId: string; pieces: number; pricing: { totalNetWeightMg: number } }[],
    branchId: string,
  ): Promise<void> {
    for (const p of priced) {
      const item = await tx.item.findUniqueOrThrow({
        where: { id: p.itemId },
        include: { metalComponents: true },
      });
      const grossMg = item.metalComponents.reduce((s, mc) => s + gramsToMg(mc.grossWeightG.toFixed(3)), 0);
      const q = signedQuantities(MovementType.SALE_OUT, item.pieces, grossMg);
      await tx.stockMovement.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          itemId: item.id,
          movementType: MovementType.SALE_OUT,
          branchId,
          pieces: q.pieces,
          grossWeightG: mgToGrams(q.grossWeightMg),
          refDocumentId: documentId,
          actorUserId: user.sub,
        },
      });
      await tx.item.update({ where: { id: item.id }, data: { status: ItemStatus.SOLD } });
    }
  }

  /**
   * Convert an issued Estimate into a Tax Invoice.
   *
   * BUSINESS RULE: the quote is honoured — line values are taken from the
   * estimate's frozen lines, NOT repriced at today's rate. GST is computed
   * fresh in TAX_INVOICE mode on those values. Linkage: invoice carries
   * `convertedFromId`; the estimate flips to CONVERTED. Items must still be
   * available; the invoice posts the stock effects the estimate never did.
   */
  async convertEstimate(user: JwtClaims, estimateId: string) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();

    return db.$transaction(async (tx) => {
      const est = await tx.document.findUniqueOrThrow({
        where: { id: estimateId },
        include: { lines: true, exchanges: true },
      });
      if (est.docType !== DocType.ESTIMATE) throw new BadRequestException('only estimates can be converted');
      if (est.status !== DocStatus.ISSUED) throw new BadRequestException(`estimate is ${est.status}, not ISSUED`);

      const branch = await tx.branch.findUniqueOrThrow({ where: { id: est.branchId } });
      const matrix = (await tx.taxRule.findMany()) as unknown as TaxRuleRow[];

      // Validate items are still sellable, gather flags for the GST engine.
      const gstLines: GstLineInput[] = [];
      const pricedForStock: { itemId: string; pieces: number; pricing: { totalNetWeightMg: number } }[] = [];
      for (const line of est.lines) {
        if (!line.itemId) throw new BadRequestException(`line ${line.lineNo} has no item — cannot convert`);
        const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
        if (!SELLABLE.has(item.status)) {
          throw new BadRequestException(`item ${item.itemCode} is no longer in stock (${item.status})`);
        }
        if (item.branchId !== est.branchId) {
          throw new BadRequestException(`item ${item.itemCode} moved branches since the estimate`);
        }
        gstLines.push({
          lineNo: line.lineNo,
          metalValuePaise: Number(line.metalValuePaise),
          stoneValuePaise: Number(line.stoneValuePaise),
          makingPaise: Number(line.makingPaise) + Number(line.extraChargesPaise),
          lineDiscountPaise: Number(line.lineDiscountPaise),
          isStudded: item.isStudded,
          isPrecious: item.isPrecious,
        });
        pricedForStock.push({ itemId: item.id, pieces: item.pieces, pricing: { totalNetWeightMg: 0 } });
      }

      const gst = computeGst({
        invoiceMode: DocType.TAX_INVOICE,
        lines: gstLines,
        matrix,
        sellerStateCode: est.sellerStateCode,
        placeOfSupplyStateCode: est.placeOfSupplyStateCode,
        exchangeValuePaise: est.exchanges.reduce((s, e) => s + Number(e.valuePaise), 0),
        at: now,
      });

      const invId = newId();
      const docNumber = await nextDocNumber(tx, user.tenantId, DocType.TAX_INVOICE, now);
      const invoice = await tx.document.create({
        data: {
          id: invId,
          tenantId: user.tenantId,
          docType: DocType.TAX_INVOICE,
          docNumber,
          status: DocStatus.ISSUED,
          branchId: est.branchId,
          customerId: est.customerId,
          issuedAt: now,
          sellerStateCode: est.sellerStateCode,
          placeOfSupplyStateCode: est.placeOfSupplyStateCode,
          gstSplit: gst.gstSplit,
          subtotalPaise: BigInt(gst.subtotalPaise),
          discountPaise: BigInt(gst.discountPaise),
          exchangeValuePaise: BigInt(gst.exchangeValuePaise),
          taxableValuePaise: BigInt(gst.taxableValuePaise),
          totalTaxPaise: BigInt(gst.totalTaxPaise),
          grandTotalPaise: BigInt(gst.grandTotalPaise),
          note: est.note,
          convertedFromId: est.id,
          createdByUserId: user.sub,
          lines: {
            create: est.lines.map((l) => ({
              id: newId(),
              tenantId: user.tenantId,
              lineNo: l.lineNo,
              itemId: l.itemId,
              description: l.description,
              hsnCode: l.hsnCode,
              pieces: l.pieces,
              metalValuePaise: l.metalValuePaise,
              stoneValuePaise: l.stoneValuePaise,
              makingPaise: l.makingPaise,
              extraChargesPaise: l.extraChargesPaise,
              makingDiscountPaise: l.makingDiscountPaise,
              lineDiscountPaise: l.lineDiscountPaise,
              grossPaise: l.grossPaise,
              taxablePaise: BigInt(gst.lineTaxablePaise.get(l.lineNo) ?? 0),
              snapshot: l.snapshot as never,
            })),
          },
          taxLines: {
            create: gst.taxBuckets.map((b) => ({
              id: newId(),
              tenantId: user.tenantId,
              kind: b.kind,
              label: b.label,
              rateBps: b.rateBps,
              taxablePaise: BigInt(b.taxablePaise),
              taxPaise: BigInt(b.taxPaise),
            })),
          },
          exchanges: {
            create: est.exchanges.map((e) => ({
              id: newId(),
              tenantId: user.tenantId,
              metalId: e.metalId,
              purityId: e.purityId,
              grossWeightG: e.grossWeightG,
              netWeightG: e.netWeightG,
              ratePaisePer10g: e.ratePaisePer10g,
              valuePaise: e.valuePaise,
              note: e.note,
            })),
          },
        },
        include: { lines: true, taxLines: true, exchanges: true },
      });

      await this.postSaleMovements(tx, user, invId, pricedForStock, est.branchId);

      // The estimate is CONVERTED — a status transition, not an edit; its
      // financial content is untouched and the linkage is bidirectional
      // (invoice.convertedFromId ↔ this status + audit).
      await tx.document.update({ where: { id: est.id }, data: { status: DocStatus.CONVERTED } });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Document',
        entityId: est.id,
        action: 'CONVERT',
        before: { status: DocStatus.ISSUED },
        after: { status: DocStatus.CONVERTED, invoiceId: invId, invoiceNumber: docNumber },
      });

      return { ...invoice, warnings: gst.warnings };
    });
  }

  /**
   * Cancel an issued document. The document row is preserved verbatim
   * (append-only); a Tax Invoice's stock effects are undone by REVERSAL
   * movements and the items return to stock.
   */
  async cancel(user: JwtClaims, documentId: string, reason: string) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId }, include: { lines: true } });
      if (doc.status !== DocStatus.ISSUED) throw new BadRequestException(`document is ${doc.status}, not ISSUED`);

      if (doc.docType === DocType.TAX_INVOICE) {
        const movements = await tx.stockMovement.findMany({ where: { refDocumentId: doc.id } });
        for (const m of movements) {
          await tx.stockMovement.create({
            data: {
              id: newId(),
              tenantId: user.tenantId,
              itemId: m.itemId,
              movementType: MovementType.REVERSAL,
              branchId: m.branchId,
              pieces: -m.pieces,
              grossWeightG: mgToGrams(-gramsToMg(m.grossWeightG.toFixed(3))),
              reversesId: m.id,
              refDocumentId: doc.id,
              note: `cancellation: ${reason}`,
              actorUserId: user.sub,
            },
          });
          await tx.item.update({ where: { id: m.itemId }, data: { status: ItemStatus.IN_STOCK } });
        }
      }

      const updated = await tx.document.update({
        where: { id: doc.id },
        data: { status: DocStatus.CANCELLED, cancelReason: reason },
      });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Document',
        entityId: doc.id,
        action: 'CANCEL',
        before: { status: DocStatus.ISSUED },
        after: { status: DocStatus.CANCELLED, reason },
      });
      return updated;
    });
  }
}
