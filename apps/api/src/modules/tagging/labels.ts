/**
 * Label templates + batch label generation.
 *
 * A LabelTemplate names a physical sticker layout (size in mm, symbology,
 * ordered list of text fields). A LabelBatch snapshots a set of tags and
 * renders them as one printable HTML sheet with the barcodes embedded as
 * data-URI PNGs — print from any browser, no printer driver coupling.
 *
 * BUSINESS RULE: price is NOT rendered as a number on labels. The optional
 * PRICE_TEXT field prints a static "rate-based" marker — selling price is
 * resolved at scan time from the live board rate, which is exactly why
 * repricing never requires reprinting (see domain/tagging/tag-code.ts).
 */
import { Body, Controller, Get, Header, Injectable, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  BarcodeSymbology,
  newId,
  Role,
  zCreateLabelBatch,
  zCreateLabelTemplate,
  zId,
  type CreateLabelBatch,
  type CreateLabelTemplate,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { renderBarcodePng } from './tags';

type LabelField = 'ITEM_CODE' | 'NAME' | 'GROSS_WEIGHT' | 'NET_WEIGHT' | 'PURITY' | 'PIECES' | 'PRICE_TEXT';

/** Minimal shape labels need from a tag + its item. */
interface TagWithItem {
  tagCode: string;
  symbology: string;
  item: {
    itemCode: string;
    name: string;
    pieces: number;
    metalComponents: { grossWeightG: { toFixed(dp: number): string }; netWeightG: { toFixed(dp: number): string }; purityId: string }[];
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Resolve one template field to its printable text for a tag. */
function fieldText(field: LabelField, tag: TagWithItem, purityLabels: Map<string, string>): string {
  const mc = tag.item.metalComponents;
  switch (field) {
    case 'ITEM_CODE':
      return tag.item.itemCode;
    case 'NAME':
      return tag.item.name;
    case 'GROSS_WEIGHT':
      return mc.length ? `G ${mc.reduce((s, c) => s + Number(c.grossWeightG.toFixed(3)), 0).toFixed(3)}g` : '';
    case 'NET_WEIGHT':
      return mc.length ? `N ${mc.reduce((s, c) => s + Number(c.netWeightG.toFixed(3)), 0).toFixed(3)}g` : '';
    case 'PURITY':
      return mc.map((c) => purityLabels.get(c.purityId) ?? '').filter(Boolean).join('/');
    case 'PIECES':
      return `${tag.item.pieces} pc`;
    case 'PRICE_TEXT':
      // Deliberately not a number: price comes from the live rate at scan.
      return 'PRICE: AS PER TODAY’S RATE';
  }
}

@Injectable()
export class LabelsService {
  constructor(private readonly tenancy: TenancyService) {}

  /** Create a batch (snapshot of tag ids against a template). */
  async createBatch(user: JwtClaims, input: CreateLabelBatch) {
    const db = this.tenancy.client(user.tenantId);
    const template = await db.labelTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
    const found = await db.tag.count({ where: { id: { in: input.tagIds } } });
    if (found !== input.tagIds.length) {
      throw new Error('some tags not found in this tenant');
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

  /** Render a batch as a printable HTML sheet (barcodes as data-URI PNGs). */
  async renderBatch(user: JwtClaims, batchId: string): Promise<string> {
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
    const fields = template.fields as LabelField[];

    const labels: string[] = [];
    for (const tag of tags) {
      const png = await renderBarcodePng(tag.tagCode, template.symbology as BarcodeSymbology);
      const rows = fields
        .map((f) => fieldText(f, tag as unknown as TagWithItem, purityLabels))
        .filter(Boolean)
        .map((t) => `<div class="f">${esc(t)}</div>`)
        .join('');
      labels.push(
        `<div class="label"><img src="data:image/png;base64,${png.toString('base64')}" alt="${esc(tag.tagCode)}"/>` +
          `<div class="code">${esc(tag.tagCode)}</div>${rows}</div>`,
      );
    }

    // mm-sized labels; print stylesheet keeps one label per sticker.
    return `<!doctype html><html><head><meta charset="utf-8"><title>Labels ${esc(batchId)}</title><style>
body{font-family:system-ui,sans-serif;margin:0;padding:4mm;display:flex;flex-wrap:wrap;gap:2mm}
.label{width:${template.widthMm}mm;height:${template.heightMm}mm;border:0.2mm solid #999;box-sizing:border-box;
padding:1mm;overflow:hidden;page-break-inside:avoid;text-align:center}
.label img{max-width:100%;max-height:45%}
.code{font-size:2.6mm;font-weight:600;letter-spacing:0.2mm}
.f{font-size:2.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media print{body{padding:0}.label{border:none}}
</style></head><body>${labels.join('')}</body></html>`;
  }
}

@ApiTags('tagging')
@ApiBearerAuth()
@Controller()
export class LabelsController {
  constructor(
    private readonly labels: LabelsService,
    private readonly tenancy: TenancyService,
  ) {}

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
        widthMm: body.widthMm,
        heightMm: body.heightMm,
        symbology: body.symbology,
        fields: body.fields,
        isDefault: body.isDefault,
      },
    });
  }

  @Post('label-batches')
  @Roles(Role.ADMIN)
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
    return this.labels.renderBatch(user, id);
  }
}
