/**
 * MasterDataModule — reference data every other module prices against:
 * metals & purities, stone types, HSN codes, the tax-rule matrix,
 * customers/suppliers/karigars, and the metal-rate board.
 * See README.md in this directory.
 */
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog';
import { TaxRulesController } from './tax-rules';
import { PartiesController } from './parties';
import { RatesController } from './rates';

@Module({
  controllers: [CatalogController, TaxRulesController, PartiesController, RatesController],
})
export class MasterDataModule {}
