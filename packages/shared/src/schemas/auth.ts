/** Auth & user DTO schemas (login, JWT payload shape, user management). */
import { z } from 'zod';
import { Role } from '../enums';
import { zId } from './common';

export const zRole = z.nativeEnum(Role);

export const zLoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof zLoginRequest>;

export const zLoginResponse = z.object({
  accessToken: z.string(),
  user: z.object({
    id: zId,
    email: z.string().email(),
    name: z.string(),
    role: zRole,
    tenantId: zId,
    branchId: zId.nullable(),
  }),
});
export type LoginResponse = z.infer<typeof zLoginResponse>;

/** Claims carried inside the JWT. `sub` is the user id. */
export const zJwtClaims = z.object({
  sub: zId,
  tenantId: zId,
  role: zRole,
  branchId: zId.nullable(),
});
export type JwtClaims = z.infer<typeof zJwtClaims>;

export const zCreateUser = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
  role: zRole,
  branchId: zId.nullable().optional(),
});
export type CreateUser = z.infer<typeof zCreateUser>;
