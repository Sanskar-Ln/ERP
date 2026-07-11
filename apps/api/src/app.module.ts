/**
 * Root application module. Feature modules (master-data, inventory,
 * tagging, billing) are added milestone by milestone.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { Public } from './platform/auth/auth.decorators';
import { PlatformModule } from './platform/platform.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { TaggingModule } from './modules/tagging/tagging.module';

/** Liveness probe — public, no DB touch. */
@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [PlatformModule, MasterDataModule, InventoryModule, TaggingModule],
  controllers: [HealthController],
})
export class AppModule {}
