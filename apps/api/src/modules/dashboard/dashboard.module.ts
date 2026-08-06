/**
 * DashboardModule — aggregated shop metrics (sales, settlement, stock,
 * order pipeline, procurement) computed from the same sources the list
 * pages use, so tiles and lists can never disagree.
 */
import { Module } from '@nestjs/common';
import { DashboardController, DashboardService } from './dashboard';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
