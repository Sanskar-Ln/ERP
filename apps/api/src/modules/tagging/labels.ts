/**
 * Label templates, batches, preview and printing.
 *
 * A LabelTemplate is a PHYSICAL layout in millimetres (rectangle sticker or
 * jewellery dumbbell tag) and is deliberately device-independent. This
 * service resolves a batch into `LabelLayout`s via the pure layout engine,
 * then hands them to whichever renderer the target printer needs:
 *
 *   ZPL   → Zebra            TSPL → TSC / Godex / Argox
 *   HTML  → any printer already installed on the shop's PC (zero setup)
 *
 * Because the design never mentions a printer, the same template prints on
 * hardware nobody had chosen when it was created.
 *
 * BUSINESS RULE: price is NOT rendered as a number on labels. PRICE_TEXT
 * prints a static "rate-based" marker — selling price is resolved at scan
 * time from the live board rate, which is exactly why repricing never
 * requires reprinting (see domain/tagging/tag-code.ts).
 */
import { BadRequestException, Body, Controller, Get, Header, Injectable, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  BarcodeSymbology,
  newId,
  PrinterConnection,
  PrinterLanguage,
  Role,
  TagShape,
  zCreateLabelBatch,
  zCreateLabelTemplate,
  zCreatePrinter,
  zId,
  type CreateLabelBatch,
  type CreateLabelTemplate,
  type CreatePrinter,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { layoutLabel, type LabelLayout, type LabelTemplateSpec, type TagLabelData } from '../../domain/tagging/label-layout';
import { renderZplBatch } from '../../domain/tagging/renderers/zpl';
import { renderTsplBatch } from '../../domain/tagging/renderers/tspl';
import { renderHtmlSheet, type HtmlLabelInput } from '../../domain/tagging/renderers/html';
import { renderBarcodePng } from './tags';
import { PrinterIoService } from './printers';

/** Decimal-ish values from Prisma → plain numbers for the pure engine. */
const num = (v: unknown): number => Number(v);

/** Turn a Prisma LabelTemplate row into the pure engine's spec. */
function toSpec(t: {
  shape: string;
  widthMm: unknown;
  heightMm: unknown;
  leftFlagMm: unknown;
  neckMm: unknown;
  rightFlagMm: unknown;
  symbology: string;
  fields: unknown;
}): LabelTemplateSpec {
  return {
    shape: t.shape as TagShape,
    widthMm: num(t.widthMm),
    heightMm: num(t.heightMm),
    leftFlagMm: t.leftFlagMm == null ? null : num(t.leftFlagMm),
    neckMm: t.neckMm == null ? null : num(t.neckMm),
    rightFlagMm: t.rightFlagMm == null ? null : num(t.rightFlagMm),
    symbology: t.symbology as BarcodeSymbology,
    fields: t.fields as LabelTemplateSpec['fields'],
  };
}

@Injectable()
export class LabelsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
    private readonly io: PrinterIoService,
  ) {}

  /** Create a batch (snapshot of tag ids against a template). */
  async createBatch(user: JwtClaims, input: CreateLabelBatch) {
    const db = this.tenancy.client(user.tenantId);
    const template = await db.labelTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
    const found = await db.tag.count({ where: { id: { in: input.tagIds } } });
    if (found !== input.tagIds.length) {
      throw new BadRequestException('some tags not found in this tenant');
    }
    return db.labelBatch.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        templateId: template.id,
        tagIds: input.tagIds,
        createdByUserId: user.sub,
      },
    });
  }

  /** Resolve a batch into device-independent layouts + its template row. */
  private async layoutsFor(user: JwtClaims, batchId: string) {
    const db = this.tenancy.client(user.tenantId);
    const batch = await db.labelBatch.findUniqueOrThrow({ where: { id: batchId } });
    const template = await db.labelTemplate.findUniqueOrThrow({ where: { id: batch.templateId } });
    const tagIds = batch.tagIds as string[];
    const tags = await db.tag.findMany({
      where: { id: { in: tagIds } },
      include: { item: { include: { metalComponents: true } } },
    });
    const purities = await db.purity.findMany();
    const purityLabels = new Map(purities.map((p) => [p.id, p.label]));
    const spec = toSpec(template);

    const layouts = tags.map((tag) => {
      const mc = tag.item.metalComponents;
      const data: TagLabelData = {
        tagCode: tag.tagCode,
        itemCode: tag.item.itemCode,
        name: tag.item.name,
        category: tag.item.category,
        grossWeightG: mc.length ? mc.reduce((s, c) => s + Number(c.grossWeightG), 0).toFixed(3) : '',
        netWeightG: mc.length ? mc.reduce((s, c) => s + Number(c.netWeightG), 0).toFixed(3) : '',
        purityLabel: mc.length ? purityLabels.get(mc[0]!.purityId) ?? '' : '',
        pieces: tag.item.pieces,
        hallmarkNo: tag.item.hallmarkNo,
      };
      return layoutLabel(spec, data);
    });

    return { batch, template, spec, layouts };
  }

  /** Render the batch as a printable HTML sheet (browser print path). */
  async renderHtml(user: JwtClaims, batchId: string): Promise<string> {
    const { template, spec, layouts } = await this.layoutsFor(user, batchId);
    const inputs: HtmlLabelInput[] = [];
    for (const layout of layouts) {
      const uris = new Map<string, string>();
      for (const el of layout.elements) {
        if (el.kind !== 'barcode') continue;
        const png = await renderBarcodePng(el.value, layout.symbology);
        uris.set(el.value, `data:image/png;base64,${png.toString('base64')}`);
      }
      inputs.push({ layout, barcodeDataUris: uris });
    }
    return renderHtmlSheet(inputs, `Labels — ${template.name}`, {
      shape: spec.shape,
      leftFlagMm: spec.leftFlagMm,
      neckMm: spec.neckMm,
    });
  }

  /** Render raw printer commands for a batch in the given language. */
  async renderRaw(user: JwtClaims, batchId: string, language: PrinterLanguage, dpi: number): Promise<string> {
    const { layouts } = await this.layoutsFor(user, batchId);
    if (language === PrinterLanguage.ZPL) return renderZplBatch(layouts, dpi);
    if (language === PrinterLanguage.TSPL) return renderTsplBatch(layouts, dpi);
    throw new BadRequestException(
      `printer language is ${language} — identify the printer first, or use the browser print path`,
    );
  }

  /**
   * Print a batch through a registered printer, routing by connection type.
   * Marks the tags printed and audits the job.
   */
  async print(user: JwtClaims, batchId: string, printerId: string) {
    const db = this.tenancy.client(user.tenantId);
    const printer = await db.printer.findUniqueOrThrow({ where: { id: printerId } });

    let body: string;
    let contentType: string;
    let filename: string | null = null;

    if (printer.connection === PrinterConnection.BROWSER || printer.language === PrinterLanguage.HTML) {
      body = await this.renderHtml(user, batchId);
      contentType = 'text/html; charset=utf-8';
    } else {
      body = await this.renderRaw(user, batchId, printer.language as PrinterLanguage, printer.dpi);
      contentType = 'text/plain; charset=utf-8';
      filename = `labels-${batchId}.${printer.language === PrinterLanguage.ZPL ? 'zpl' : 'txt'}`;
      if (printer.connection === PrinterConnection.NETWORK) {
        await this.io.send(printer.host, printer.port, body);
      }
    }

    // Record that these tags have been printed (reprints are allowed; this
    // is provenance, not a lock).
    const batch = await db.labelBatch.findUniqueOrThrow({ where: { id: batchId } });
    await db.tag.updateMany({ where: { id: { in: batch.tagIds as string[] } }, data: { printedAt: new Date() } });

    await db.$transaction(async (tx) => {
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'LabelBatch',
        entityId: batchId,
        action: 'PRINT',
        after: {
          printerId,
          printerName: printer.name,
          connection: printer.connection,
          language: printer.language,
          labels: (batch.tagIds as string[]).length,
        },
      });
    });

    return { body, contentType, filename, sent: printer.connection === PrinterConnection.NETWORK };
  }
}

const zPrintQuery = z.object({ printerId: zId });
const zRawQuery = z.object({
  language: z.enum([PrinterLanguage.ZPL, PrinterLanguage.TSPL]),
  dpi: z.coerce.number().int().min(100).max(600).default(203),
});

@ApiTags('tagging')
@ApiBearerAuth()
@Controller()
export class LabelsController {
  constructor(
    private readonly labels: LabelsService,
    private readonly tenancy: TenancyService,
    private readonly io: PrinterIoService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ templates

  @Get('label-templates')
  listTemplates(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).labelTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('label-templates')
  @Roles(Role.ADMIN)
  @ApiZodBody(zCreateLabelTemplate)
  createTemplate(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateLabelTemplate)) body: CreateLabelTemplate) {
    return this.tenancy.client(user.tenantId).labelTemplate.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        name: body.name,
        shape: body.shape,
        widthMm: body.widthMm,
        heightMm: body.heightMm,
        leftFlagMm: body.leftFlagMm ?? null,
        neckMm: body.neckMm ?? null,
        rightFlagMm: body.rightFlagMm ?? null,
        symbology: body.symbology,
        fields: body.fields,
        isDefault: body.isDefault,
      },
    });
  }

  /** Replace a template's design (same id, so batches keep resolving). */
  @Post('label-templates/:id')
  @Roles(Role.ADMIN)
  @ApiZodBody(zCreateLabelTemplate)
  updateTemplate(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zCreateLabelTemplate)) body: CreateLabelTemplate,
  ) {
    return this.tenancy.client(user.tenantId).labelTemplate.update({
      where: { id },
      data: {
        name: body.name,
        shape: body.shape,
        widthMm: body.widthMm,
        heightMm: body.heightMm,
        leftFlagMm: body.leftFlagMm ?? null,
        neckMm: body.neckMm ?? null,
        rightFlagMm: body.rightFlagMm ?? null,
        symbology: body.symbology,
        fields: body.fields,
        isDefault: body.isDefault,
      },
    });
  }

  // ------------------------------------------------------------ batches

  @Post('label-batches')
  @ApiZodBody(zCreateLabelBatch)
  createBatch(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateLabelBatch)) body: CreateLabelBatch) {
    return this.labels.createBatch(user, body);
  }

  @Get('label-batches')
  listBatches(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).labelBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Printable HTML sheet for the batch. Open in a browser and print. */
  @Get('label-batches/:id/render')
  @Header('Content-Type', 'text/html; charset=utf-8')
  render(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.labels.renderHtml(user, id);
  }

  /** Raw printer commands, without needing a registered printer. */
  @Get('label-batches/:id/raw')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  raw(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Query(new ZodPipe(zRawQuery)) q: z.infer<typeof zRawQuery>,
  ) {
    return this.labels.renderRaw(user, id, q.language as PrinterLanguage, q.dpi);
  }

  /** Print through a registered printer (routes by its connection type). */
  @Post('label-batches/:id/print')
  async print(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Query(new ZodPipe(zPrintQuery)) q: z.infer<typeof zPrintQuery>,
  ) {
    const out = await this.labels.print(user, id, q.printerId);
    return { sent: out.sent, filename: out.filename, contentType: out.contentType, body: out.body };
  }

  // ------------------------------------------------------------ printers

  @Get('printers')
  listPrinters(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).printer.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('printers')
  @Roles(Role.ADMIN)
  @ApiZodBody(zCreatePrinter)
  createPrinter(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreatePrinter)) body: CreatePrinter) {
    return this.tenancy.client(user.tenantId).printer.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        name: body.name,
        connection: body.connection,
        language: body.language,
        host: body.host ?? null,
        port: body.port,
        dpi: body.dpi,
        isDefault: body.isDefault,
      },
    });
  }

  /**
   * Ask the hardware what it is, and adopt the answer.
   * This is what lets a shop register a printer before knowing its brand:
   * AUTO becomes ZPL or TSPL the moment the device replies.
   */
  @Post('printers/:id/identify')
  @Roles(Role.ADMIN)
  async identify(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const db = this.tenancy.client(user.tenantId);
    const printer = await db.printer.findUniqueOrThrow({ where: { id } });
    if (printer.connection !== PrinterConnection.NETWORK || !printer.host) {
      throw new BadRequestException('only network printers can be identified — set a host first');
    }
    const result = await this.io.identify(printer.host, printer.port);
    const updated = await db.printer.update({
      where: { id },
      data: {
        detectedModel: result.model,
        lastSeenAt: new Date(),
        // never downgrade a known language to AUTO on an unrecognised reply
        ...(result.language !== PrinterLanguage.AUTO ? { language: result.language } : {}),
      },
    });
    await db.$transaction(async (tx) => {
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Printer',
        entityId: id,
        action: 'IDENTIFY',
        after: { detectedModel: result.model, language: updated.language, raw: result.raw.slice(0, 200) },
      });
    });
    return { printer: updated, detected: result };
  }
}
