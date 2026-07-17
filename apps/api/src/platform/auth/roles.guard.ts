/**
 * RolesGuard — RBAC enforcement.
 *
 * Routes declare required roles with @Roles(Role.ADMIN) / @Roles(Role.OPS).
 * A route without @Roles only requires authentication. ADMIN passes every
 * role check (full access); OPS passes only checks that name it.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, type JwtClaims } from '@erp/shared';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest().user as JwtClaims | undefined;
    if (!user) throw new ForbiddenException('no user on request');
    if (user.role === Role.ADMIN || required.includes(user.role)) return true;
    throw new ForbiddenException(`requires role: ${required.join(' | ')}`);
  }
}
