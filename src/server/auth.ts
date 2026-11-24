import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

export const SESSION_COOKIE_NAME = 'mep_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  monthlyBudget: number;
  createdAt: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
  authToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  // Clean expired sessions for this user opportunistically
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?`).run(
    userId,
    now.toISOString()
  );

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return token;
}

export function revokeSession(token: string): void {
  const tokenHash = hashToken(token);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1';

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1';

  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function isSameOriginOrXhr(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return true;
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  let usedCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookieHeader(req.headers.cookie);
    if (cookies[SESSION_COOKIE_NAME]) {
      token = cookies[SESSION_COOKIE_NAME];
      usedCookie = true;
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  if (usedCookie && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!isSameOriginOrXhr(req)) {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
  }

  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.monthly_budget, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        name: string;
        email: string;
        monthly_budget: number;
        created_at: string;
        expires_at: string;
      }
    | undefined;

  if (!row || row.expires_at <= nowIso) {
    if (row) {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    }
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  req.authUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    monthlyBudget: Number(row.monthly_budget || 0),
    createdAt: row.created_at,
  };
  req.authToken = token;
  next();
}
