// 密码和登录令牌。密码用 scrypt 加盐哈希；令牌只存哈希值，数据库泄露也不能直接登录。
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('base64');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  const ref = Buffer.from(hash, 'base64');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('base64url');
}

export function newId(prefix = 'u') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function newInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[b[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function tempPassword() {
  return crypto.randomBytes(6).toString('base64url');
}

export function validEmail(s) {
  return typeof s === 'string' && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 8) return '密码至少 8 位';
  if (p.length > 200) return '密码太长';
  return null;
}

/** 简单的限流：同一个 IP 在窗口期内最多 N 次 */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return arr.length <= max;
  };
}
