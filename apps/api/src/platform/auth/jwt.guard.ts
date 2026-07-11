/**
 * JwtAuthGuard — global guard verifying the `Authorization: Bearer <jwt>`
 * header on every route not marked @Public(). On success it attaches the
 * verified claims (`sub`, `tenantId`, `role`, `branchId`) to `req.user`;
 * everything downstream (RBAC, tenancy) trusts only these claims.
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { zJwtClaims } from '@erp/shared';
import { IS_PUBLIC_KEY } from './auth.decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('missing bearer token');

    try {
      const payload = await this.jwt.verifyAsync(token);
      // Validate claim shape — a token with unexpected structure is rejected
      // even if its signature verifies (defence against key reuse).
      req.user = zJwtClaims.parse(payload);
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
  }
}
