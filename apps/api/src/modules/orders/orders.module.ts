/**
 * OrdersModule — customer-order pipeline (workflow object linked to
 * billing documents). Transitions validated by domain/orders/transitions;
 * CONFIRMED reserves stock lines, CANCELLED releases them.
 */
import { Module } from '@nestjs/common';
import { OrdersController, OrdersService } from './orders';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
