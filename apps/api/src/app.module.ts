/**
 * Root application module. Feature modules (master-data, inventory,
 * tagging, billing) are added milestone by milestone.
 */
import { Controller, Get, Module } from '@nestjs/common';
import { Public } from './platform/auth/auth.decorators';
import { PlatformModule } from './platform/platform.module';

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
  imports: [PlatformModule],
  controllers: [HealthController],
})
export class AppModule {}
