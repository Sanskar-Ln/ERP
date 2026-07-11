/**
 * ZodPipe — request validation via the shared zod schemas.
 *
 * Controllers validate bodies/queries with the exact schemas that web and
 * mobile use for their forms (`@erp/shared`), so the contract cannot drift
 * between clients and server. Failures return 400 with zod's flattened
 * field errors.
 */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

@Injectable()
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({ message: 'validation failed', errors: result.error.flatten() });
    }
    return result.data;
  }
}
