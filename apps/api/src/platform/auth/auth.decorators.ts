/**
 * Auth decorators:
 * - @Public()      — route skips JWT verification (login, health)
 * - @Roles(...)    — route requires one of the given roles (ADMIN bypasses)
 * - @CurrentUser() — injects the verified JWT claims into a handler param
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { JwtClaims, Role } from '@erp/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtClaims => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as JwtClaims;
});
