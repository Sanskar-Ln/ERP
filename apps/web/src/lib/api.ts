/**
 * API client for the web admin.
 *
 * Thin fetch wrapper: attaches the JWT from localStorage, JSON-encodes
 * bodies, throws `ApiError` with the server's message on non-2xx. All
 * money values arriving here are integer paise (see @erp/shared).
 */
'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

const TOKEN_KEY = 'erp.jwt';
const USER_KEY = 'erp.user';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  branchId: string | null;
}

export const session = {
  token: (): string | null => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  user: (): SessionUser | null => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },
  save(token: string, user: SessionUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

/**
 * Role check for UI gating only — the API enforces the same rules
 * server-side (RolesGuard), so hiding a control here is UX, not security.
 */
export const isAdmin = (): boolean => session.user()?.role === 'ADMIN';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

/** Perform an authenticated JSON request against the API. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = session.token();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    session.clear();
    window.location.href = '/login';
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (json && (json.message?.message ?? json.message)) || res.statusText;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : JSON.stringify(msg), json);
  }
  return json as T;
}

/** Fetch a protected non-JSON resource (barcode PNG, label sheet HTML) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const token = session.token();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText, null);
  return res.blob();
}

/** Format integer paise for display: 1234550 → "₹12,345.50" (Indian grouping). */
export function inr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = (abs % 100).toString().padStart(2, '0');
  const s = rupees.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${sign}₹${grouped}.${p}`;
}
