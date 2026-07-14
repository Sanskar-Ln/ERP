/**
 * Mobile API client — thin fetch wrapper, JWT + user kept in memory
 * (online-only MVP; no secure storage dependency yet). Money is integer
 * paise everywhere, matching @erp/shared conventions.
 *
 * NOTE for device testing: replace `apiUrl` in app.json `extra` with the
 * machine's LAN address (e.g. http://192.168.1.10:3001/api/v1) — an
 * emulator/device cannot reach the host's localhost.
 */
import { API_URL } from './config';

/** The logged-in user as returned by POST /auth/login. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'SALESPERSON' | 'ACCOUNTANT';
  tenantId: string;
  branchId: string | null;
}

let token: string | null = null;
let user: SessionUser | null = null;

export const session = {
  set(t: string, u: SessionUser): void {
    token = t;
    user = u;
  },
  clear(): void {
    token = null;
    user = null;
  },
  user: (): SessionUser | null => user,
  authed: (): boolean => token !== null,
  /** Managers and owners get the admin view; everyone else the counter view. */
  isManager: (): boolean => user?.role === 'OWNER' || user?.role === 'MANAGER',
};

/** JSON request against the ERP API; throws Error with server message. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (json && (json.message?.message ?? json.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return json as T;
}

/** Format integer paise as INR with Indian digit grouping. */
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

/** Shared styling tokens so every screen stays visually consistent.
 *  `amber` matches the web admin's gold-600 — one brand across clients. */
export const ui = {
  amber: '#b76f1f',
  border: '#e7e5e4',
  muted: '#78716c',
  faint: '#a8a29e',
  text: '#44403c',
  bg: '#fafaf9',
  red: '#dc2626',
  green: '#15803d',
} as const;
