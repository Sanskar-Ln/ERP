/**
 * Auth endpoints:
 * - POST /auth/register  (public) — SaaS signup: tenant + branch + owner
 * - POST /auth/login     (public) — JWT issuance
 * - GET  /auth/me                 — verified claims of the caller
 * - POST /auth/users              — create staff user (OWNER/MANAGER)
 */
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Role, zCreateUser, zGstStateCode, zGstin, zLoginRequest, type CreateUser, type JwtClaims, type LoginRequest } from '@erp/shared';
import { CurrentUser, Public, Roles } from './auth.decorators';
import { AuthService } from './auth.service';
import { ZodPipe } from '../validation/zod.pipe';
import { ApiZodBody } from '../validation/openapi';

const zRegisterTenant = z.object({
  tenantName: z.string().min(1).max(120),
  stateCode: zGstStateCode,
  gstin: zGstin.optional(),
  branchName: z.string().min(1).max(120),
  owner: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(120),
    password: z.string().min(8).max(128),
  }),
});
type RegisterTenant = z.infer<typeof zRegisterTenant>;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiZodBody(zRegisterTenant)
  register(@Body(new ZodPipe(zRegisterTenant)) body: RegisterTenant) {
    return this.auth.registerTenant(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiZodBody(zLoginRequest)
  login(@Body(new ZodPipe(zLoginRequest)) body: LoginRequest) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  me(@CurrentUser() user: JwtClaims) {
    return user;
  }

  @Post('users')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateUser)
  createUser(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateUser)) body: CreateUser) {
    return this.auth.createUser(user.tenantId, user.sub, body);
  }
}
