/**
 * Paper-bill endpoints:
 * - POST /customers/:id/paper-bills   multipart upload (file + note + billDate)
 * - GET  /customers/:id/paper-bills   list a customer's uploads, newest first
 * - GET  /paper-bills/:id/file        stream the stored file (inline)
 *
 * Storage: files land on local disk under UPLOAD_DIR (default
 * apps/api/uploads/), named `<uuid><ext>` — the original name is kept in
 * the DB for display only, never trusted as a path. Accepted types:
 * JPEG/PNG/WebP/PDF, max 10 MB. Rows are append-only (no update/delete),
 * and every upload writes an audit row. Tenant scoping applies to both
 * the row and (via the row) the file — a file is only ever served after
 * a tenant-scoped read of its PaperBill row.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { z } from 'zod';
import { newId, zId, type JwtClaims } from '@erp/shared';
import { CurrentUser } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { OcrService } from './ocr.service';
import { parseBillText } from '../../domain/paper-bills/parse-bill-text';

/** Where uploaded files live. Created eagerly so multer never races it. */
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const zUploadMeta = z.object({
  note: z.string().max(300).optional(),
  /** date written on the paper bill (not the upload date) */
  billDate: z.coerce.date().optional(),
});

@ApiTags('paper-bills')
@ApiBearerAuth()
@Controller()
export class PaperBillsController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
    private readonly ocr: OcrService,
  ) {}

  /** Upload one paper bill for a customer (multipart field name: `file`). */
  @Post('customers/:id/paper-bills')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        note: { type: 'string' },
        billDate: { type: 'string', format: 'date' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        // Never derive the stored name from user input — uuid + real ext.
        filename: (_req, file, cb) => cb(null, `${newId()}${extname(file.originalname).toLowerCase()}`),
      }),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) =>
        ALLOWED_MIME.has(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException(`unsupported type ${file.mimetype} — use JPEG/PNG/WebP/PDF`), false),
    }),
  )
  async upload(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) customerId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(zUploadMeta)) meta: z.infer<typeof zUploadMeta>,
  ) {
    if (!file) throw new BadRequestException('multipart field "file" is required');
    const db = this.tenancy.client(user.tenantId);
    try {
      // Tenant-scoped read: 404s if the customer belongs to another tenant.
      await db.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true } });
      const row = await db.paperBill.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          customerId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: file.filename,
          note: meta.note ?? null,
          billDate: meta.billDate ?? null,
          uploadedByUserId: user.sub,
        },
      });
      await this.audit.log(db, {
        actorUserId: user.sub,
        entity: 'PaperBill',
        entityId: row.id,
        action: 'UPLOAD',
        after: { customerId, fileName: file.originalname, sizeBytes: file.size },
      });
      return row;
    } catch (e) {
      // The DB row failed — don't leave an orphaned file on disk.
      try {
        unlinkSync(join(UPLOAD_DIR, file.filename));
      } catch {
        /* already gone */
      }
      throw e;
    }
  }

  /** All paper bills of a customer, newest first. */
  @Get('customers/:id/paper-bills')
  list(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) customerId: string) {
    return this.tenancy.client(user.tenantId).paperBill.findMany({
      where: { customerId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Read the paper bill with OCR and extract structured fields
   * (bill number, date, amounts + guessed total, weights, per-10g rate,
   * phones) so staff can key in the online bill faster.
   *
   * IMPORTANT BUSINESS STANCE: the extraction is a DRAFT for a human to
   * review — old bills are often handwritten and OCR is lossy — so the
   * result is stored on the PaperBill (`extracted`, `extractedAt`) and
   * shown in the UI, never auto-posted into billing. Re-running replaces
   * the previous extraction (audited each time). Images only; PDFs need
   * rasterizing, which is out of MVP scope.
   */
  @Post('paper-bills/:id/extract')
  async extract(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const db = this.tenancy.client(user.tenantId);
    const row = await db.paperBill.findUniqueOrThrow({ where: { id } });
    if (!row.mimeType.startsWith('image/')) {
      throw new BadRequestException('OCR supports images only — upload JPEG/PNG/WebP for extraction');
    }
    const path = join(UPLOAD_DIR, row.storagePath);
    if (!existsSync(path)) throw new BadRequestException('file missing from storage');

    const text = await this.ocr.recognize(path);
    const fields = parseBillText(text); // pure domain parsing
    const extracted = { text, fields };

    const updated = await db.paperBill.update({
      where: { id },
      data: { extracted, extractedAt: new Date() },
    });
    await this.audit.log(db, {
      actorUserId: user.sub,
      entity: 'PaperBill',
      entityId: id,
      action: 'EXTRACT',
      after: { fields },
    });
    return updated;
  }

  /** Stream the stored file. Served only after a tenant-scoped row read. */
  @Get('paper-bills/:id/file')
  @Header('Cache-Control', 'private, max-age=3600')
  async file(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const row = await this.tenancy.client(user.tenantId).paperBill.findUniqueOrThrow({ where: { id } });
    const path = join(UPLOAD_DIR, row.storagePath);
    if (!existsSync(path)) throw new BadRequestException('file missing from storage');
    return new StreamableFile(createReadStream(path), {
      type: row.mimeType,
      disposition: `inline; filename="${row.fileName.replace(/[^\w.\- ]/g, '_')}"`,
    });
  }
}
