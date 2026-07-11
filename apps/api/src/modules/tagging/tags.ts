/**
 * Per-piece tags + server-side barcode rendering.
 *
 * BUSINESS RULE: the barcode payload is the tag code (`ITEMCODE#ordinal`)
 * and nothing else — see domain/tagging/tag-code.ts. Rendering happens
 * server-side with bwip-js: Code128 by default (1D, wide scanner support),
 * DataMatrix optional (2D, for tiny jewellery tags).
 */
import { BadRequestException, Body, Controller, Get, Header, Injectable, Param, Post, Query } from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bwipjs from 'bwip-js';
import { z } from 'zod';
import {
  BarcodeSymbology,
  newId,
  Role,
  zCreateTags,
  zId,
  type CreateTags,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { assertPriceFreePayload, buildTagCode } from '../../domain/tagging/tag-code';

/** bwip-js symbology ids for our supported barcode types. */
const BCID: Record<BarcodeSymbology, string> = {
  CODE128: 'code128',
  DATAMATRIX: 'datamatrix',
};

/**
 * Render a barcode PNG for a payload. Exported for reuse by label batches.
 * The payload is asserted price-free at this boundary — belt and braces.
 */
export async function renderBarcodePng(payload: string, symbology: BarcodeSymbology): Promise<Buffer> {
  assertPriceFreePayload(payload);
  return bwipjs.toBuffer({
    bcid: BCID[symbology],
    text: payload,
    scale: 3,
    ...(symbology === BarcodeSymbology.CODE128 ? { height: 8, includetext: false } : {}),
  });
}

@Injectable()
export class TagsService {
  constructor(private readonly tenancy: TenancyService) {}

  /**
   * Create `count` tags for an item, one per physical piece. Ordinals
   * continue after existing tags so re-tagging extra pieces never collides.
   */
  async createTags(user: JwtClaims, input: CreateTags) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: input.itemId } });
      const existing = await tx.tag.count({ where: { itemId: input.itemId } });
      if (existing + input.count > item.pieces) {
        throw new BadRequestException(
          `item has ${item.pieces} piece(s); ${existing} already tagged — cannot add ${input.count} more`,
        );
      }
      const tags = [];
      for (let i = 1; i <= input.count; i++) {
        tags.push(
          await tx.tag.create({
            data: {
              id: newId(),
              tenantId: user.tenantId,
              itemId: input.itemId,
              tagCode: buildTagCode(item.itemCode, existing + i),
              symbology: input.symbology,
            },
          }),
        );
      }
      return tags;
    });
  }
}

const zTagQuery = z.object({ itemId: zId.optional() });

@ApiTags('tagging')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(
    private readonly tags: TagsService,
    private readonly tenancy: TenancyService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zTagQuery)) q: z.infer<typeof zTagQuery>) {
    return this.tenancy.client(user.tenantId).tag.findMany({
      where: { itemId: q.itemId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateTags)
  create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateTags)) body: CreateTags) {
    return this.tags.createTags(user, body);
  }

  /** Resolve a scanned tag code (URL-encoded) to its tag + item. */
  @Get('scan/:tagCode')
  scan(@CurrentUser() user: JwtClaims, @Param('tagCode') tagCode: string) {
    return this.tenancy.client(user.tenantId).tag.findFirstOrThrow({
      where: { tagCode: decodeURIComponent(tagCode) },
      include: { item: { include: { metalComponents: true, stoneComponents: true } } },
    });
  }

  /** The tag's barcode as PNG — payload is the price-free tag code. */
  @Get(':id/barcode.png')
  @Header('Cache-Control', 'private, max-age=86400') // payload is immutable
  async barcode(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const tag = await this.tenancy.client(user.tenantId).tag.findUniqueOrThrow({ where: { id } });
    const png = await renderBarcodePng(tag.tagCode, tag.symbology as BarcodeSymbology);
    return new StreamableFile(png, { type: 'image/png' });
  }
}
