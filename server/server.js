// 课程助手后端：账号、云同步、管理后台、手机版查看页。零依赖，Node 20+。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './lib/db.js';
import {
  hashPassword, verifyPassword, newToken, tokenHash, newId, newInviteCode, tempPassword,
  validEmail, passwordProblem, rateLimiter
} from './lib/auth.js';
import { namesMatch, displayName } from './lib/names.js';
import { sendMail, smtpConfigured } from './lib/mailer.js';
import { pickReminders, pruneSent, buildReminderEmail, itemKey } from './lib/reminders.js';

// 和插件共用"是否已完成"的判断：Docker 里在 ./shared/lib，源码里在 ../extension/src/lib
const __here = path.dirname(fileURLToPath(import.meta.url));
const FORMAT_JS = [path.join(__here, 'shared/lib/format.js'), path.join(__here, '../extension/src/lib/format.js')].find((f) => fs.existsSync(f));
const { isDone } = await import(FORMAT_JS);

export const SERVER_VERSION = '1.1.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_IDLE_DAYS = 60;
const DAY = 24 * 3600 * 1000;

const today = (d = new Date()) => d.toISOString().slice(0, 10);
const num = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : 0);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8'
};

export function createServer({ dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'), adminEmails = process.env.ADMIN_EMAILS || '', trustProxy = process.env.TRUST_PROXY !== '0', siteName = process.env.SITE_NAME || '课程助手', reminderEveryMs = 5 * 60 * 1000, mailer = sendMail } = {}) {
  const db = createDb(dataDir);
  const D = () => db.data;
  const admins = new Set(adminEmails.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  const authLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const PUBLIC = path.join(__dirname, 'public');
  const SHARED_LIB = [path.join(__dirname, 'shared'), path.join(__dirname, '..', 'extension', 'src')];

  // ---------------- 工具 ----------------
  const publicUser = (u) => ({
    id: u.id, email: u.email, name: u.name, firstName: u.firstName || '', lastName: u.lastName || '', role: u.role, createdAt: u.createdAt,
    verify: u.verify || { status: 'pending' },
    reminders: { h24: u.reminders?.h24 !== false, h3: u.reminders?.h3 !== false },
    mustChangePassword: !!u.mustChangePassword
  });
  const verified = (u) => u.verify?.status === 'ok';
  const mailCfg = () => D().settings.mail || {};
  const siteUrl = (req) => D().settings.siteUrl || (req ? `https://${req.headers.host}` : '');

  function clientIp(req) {
    if (trustProxy) {
      const xf = req.headers['x-forwarded-for'];
      if (xf) return String(xf).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '';
  }

  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    });
    res.end(data);
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(new HttpError(413, '数据太大'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, '请求格式不对')); }
      });
      req.on('error', reject);
    });
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    const host = req.headers.host;
    const ok = origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') || origin === `https://${host}` || origin === `http://${host}`;
    if (ok) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
  }

  function authenticate(req, { required = true, admin = false } = {}) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token) {
      if (required) throw new HttpError(401, '请先登录', 'NO_TOKEN');
      return null;
    }
    const th = tokenHash(token);
    const s = D().sessions.find((x) => x.tokenHash === th);
    if (!s || Date.now() - Date.parse(s.lastUsedAt) > SESSION_IDLE_DAYS * DAY) throw new HttpError(401, '登录已过期，请重新登录', 'EXPIRED');
    const u = D().users.find((x) => x.id === s.userId);
    if (!u) throw new HttpError(401, '账号不存在', 'NO_USER');
    if (u.disabled) throw new HttpError(401, '账号已被管理员停用', 'DISABLED');
    if (admin && u.role !== 'admin') throw new HttpError(403, '需要管理员权限');
    const now = new Date().toISOString();
    if (Date.now() - Date.parse(s.lastUsedAt) > 60 * 1000) {
      s.lastUsedAt = now;
      u.lastSeenAt = now;
      db.save();
    }
    return { user: u, session: s };
  }

  function createSession(u, req) {
    const token = newToken();
    const now = new Date().toISOString();
    D().sessions.push({ tokenHash: tokenHash(token), userId: u.id, createdAt: now, lastUsedAt: now, ua: str(req.headers['user-agent'], 160), ip: clientIp(req) });
    // 每人最多保留 10 个登录设备
    const mine = D().sessions.filter((s) => s.userId === u.id).sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
    if (mine.length > 10) {
      const drop = new Set(mine.slice(10).map((s) => s.tokenHash));
      D().sessions = D().sessions.filter((s) => !drop.has(s.tokenHash));
    }
    u.lastSeenAt = now;
    db.save();
    return token;
  }

  function publicSettingsAdmin() {
    const s = D().settings;
    const { pass, ...mail } = s.mail || {};
    return { ...s, mail: { ...mail, hasPass: !!pass, configured: smtpConfigured(s.mail) } };
  }

  // ---------------- 发信 ----------------
  async function deliver(to, msg, { kind = 'reminder', userId = null } = {}) {
    const cfg = mailCfg();
    const day = today();
    const st = ((D().mailStats ||= {})[day] ||= { sent: 0, failed: 0 });
    for (const k of Object.keys(D().mailStats)) if (Date.now() - Date.parse(k) > 30 * DAY) delete D().mailStats[k];
    const log = (D().mailLog ||= []);
    try {
      await mailer(cfg, { to, ...msg });
      st.sent += 1;
      log.unshift({ at: new Date().toISOString(), to, subject: msg.subject, kind, ok: true, userId });
    } catch (e) {
      st.failed += 1;
      log.unshift({ at: new Date().toISOString(), to, subject: msg.subject, kind, ok: false, error: e.message, userId });
      throw e;
    } finally {
      if (log.length > 200) log.length = 200;
      db.save();
    }
  }

  let reminderRunning = false;
  async function runReminders(now = new Date()) {
    if (reminderRunning) return { skipped: true };
    if (!smtpConfigured(mailCfg())) return { ok: false, reason: 'MAIL_OFF', sent: 0 };
    reminderRunning = true;
    let sent = 0;
    let failed = 0;
    try {
      for (const u of D().users) {
        if (u.disabled || !verified(u)) continue;
        if (u.reminders?.h24 === false && u.reminders?.h3 === false) continue;
        const st = db.readState(u.id);
        if (!st.snapshot) continue;
        const picks = pickReminders({
          snapshot: st.snapshot, overrides: st.overrides || {}, hiddenCourseIds: st.settings?.hiddenCourseIds || [],
          sent: st.reminded || {}, prefs: u.reminders || {}, now, isDone
        });
        if (!picks.length) continue;
        const mail = buildReminderEmail({ name: u.firstName || u.name, picks, now, siteUrl: siteUrl(), snapshotAt: st.snapshotAt || 0 });
        try {
          await deliver(u.email, mail, { kind: 'reminder', userId: u.id });
          const fresh = db.readState(u.id); // 发信期间插件可能刚上传过，重新读一次再写
          const reminded = pruneSent(fresh.reminded || {}, now);
          for (const p of picks) reminded[`${itemKey(p.item)}|${p.window}`] = now.toISOString();
          fresh.reminded = reminded;
          db.writeState(u.id, fresh);
          u.reminderCount = (u.reminderCount || 0) + 1;
          u.lastReminderAt = now.toISOString();
          sent += 1;
        } catch {
          failed += 1; // 下一轮（5 分钟后）再试；失败原因记在发信记录里
        }
      }
    } finally {
      reminderRunning = false;
      db.save();
    }
    return { ok: true, sent, failed };
  }

  function flagsFor() {
    return { sync: D().settings.flags.sync !== false };
  }

  // ---------------- 路由 ----------------
  const routes = [];
  const route = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, limit: opts.limit || 64 * 1024 });
  };

  route('GET', '/healthz', () => ({ ok: true, version: SERVER_VERSION }));

  route('GET', '/api/info', () => ({
    name: siteName,
    version: SERVER_VERSION,
    registration: D().users.length === 0 ? 'open' : D().settings.registration,
    firstUser: D().users.length === 0,
    announcement: D().settings.announcement || ''
  }));

  route('POST', '/api/auth/register', async ({ req, body }) => {
    if (!authLimit(`auth:${clientIp(req)}`)) throw new HttpError(429, '尝试次数太多，过 15 分钟再试');
    const email = str(body.email, 120).toLowerCase();
    const firstName = str(body.firstName, 40);
    const lastName = str(body.lastName, 40);
    const password = String(body.password || '');
    if (!firstName || !lastName) throw new HttpError(400, '请填写 First name 和 Last name（要和 Brightspace 上的一致）');
    const name = displayName(firstName, lastName);
    if (!validEmail(email)) throw new HttpError(400, '邮箱格式不对');
    const pp = passwordProblem(password);
    if (pp) throw new HttpError(400, pp);
    if (D().users.some((u) => u.email === email)) throw new HttpError(409, '这个邮箱已经注册过了，直接登录就行');

    const first = D().users.length === 0;
    const mode = D().settings.registration;
    let invite = null;
    if (!first && !admins.has(email)) {
      if (mode === 'closed') throw new HttpError(403, '管理员暂时关闭了注册');
      if (mode === 'invite') {
        const code = str(body.invite, 20).toUpperCase();
        invite = D().invites.find((i) => i.code === code);
        if (!code) throw new HttpError(400, '需要邀请码，找管理员要一个', 'INVITE_REQUIRED');
        if (!invite || invite.usesLeft <= 0) throw new HttpError(400, '邀请码不对或已经用完了', 'INVITE_INVALID');
      }
    }
    const now = new Date().toISOString();
    const u = {
      id: newId('u'), email, name, firstName, lastName, role: first || admins.has(email) ? 'admin' : 'user',
      verify: { status: 'pending' }, reminders: { h24: true, h3: true },
      passwordHash: hashPassword(password), disabled: false, createdAt: now, lastSeenAt: now, lastSyncAt: null,
      invitedWith: invite ? invite.code : null
    };
    D().users.push(u);
    if (invite) {
      invite.usesLeft -= 1;
      invite.usedBy.push({ userId: u.id, email, at: now });
    }
    db.audit('register', email, first ? '第一个用户，自动成为管理员' : invite ? `邀请码 ${invite.code}` : '');
    const token = createSession(u, req);
    return { token, user: publicUser(u), flags: flagsFor() };
  });

  route('POST', '/api/auth/login', async ({ req, body }) => {
    if (!authLimit(`auth:${clientIp(req)}`)) throw new HttpError(429, '尝试次数太多，过 15 分钟再试');
    const email = str(body.email, 120).toLowerCase();
    const u = D().users.find((x) => x.email === email);
    if (!u || !verifyPassword(String(body.password || ''), u.passwordHash)) throw new HttpError(401, '邮箱或密码不对', 'BAD_LOGIN');
    if (u.disabled) throw new HttpError(403, '账号已被管理员停用', 'DISABLED');
    const token = createSession(u, req);
    return { token, user: publicUser(u), flags: flagsFor() };
  });

  route('POST', '/api/auth/logout', ({ req }) => {
    const a = authenticate(req);
    D().sessions = D().sessions.filter((s) => s !== a.session);
    db.save();
    return { ok: true };
  });

  route('GET', '/api/me', ({ req }) => {
    const { user } = authenticate(req);
    return { user: publicUser(user), flags: flagsFor(), announcement: D().settings.announcement || '' };
  });

  route('PATCH', '/api/me', ({ req, body }) => {
    const { user } = authenticate(req);
    // 校验通过后不能自己改名字（要改找管理员），没通过时可以改正拼写
    if ((body.firstName != null || body.lastName != null) && !verified(user)) {
      const f = str(body.firstName ?? user.firstName, 40);
      const l = str(body.lastName ?? user.lastName, 40);
      if (!f || !l) throw new HttpError(400, 'First name 和 Last name 都要填');
      user.firstName = f;
      user.lastName = l;
      user.name = displayName(f, l);
      user.verify = { status: 'pending' };
    }
    if (body.reminders && typeof body.reminders === 'object') {
      user.reminders = { h24: body.reminders.h24 !== false, h3: body.reminders.h3 !== false };
    }
    db.save();
    return { user: publicUser(user) };
  });

  // 插件读到 Brightspace 上的姓名后调用：一致才放行，并把这个 Brightspace 账号绑定到这个注册账号
  route('POST', '/api/me/verify', ({ req, body }) => {
    const { user } = authenticate(req);
    const bs = { firstName: str(body.firstName, 60), lastName: str(body.lastName, 60) };
    const bsId = str(body.identifier, 40);
    const uniqueName = str(body.uniqueName, 60);
    if (!bs.firstName && !bs.lastName) throw new HttpError(400, '没读到 Brightspace 上的姓名');
    const prev = user.verify || {};
    const now = new Date().toISOString();
    const bsName = displayName(bs.firstName, bs.lastName);
    let status;
    let reason = '';
    const other = bsId && D().users.find((u) => u.id !== user.id && u.verify?.bsId === bsId && verified(u));
    if (other) {
      status = 'taken';
      reason = '这个 Brightspace 账号已经绑定了另一个课程助手账号';
    } else if (prev.bsId && bsId && prev.bsId !== bsId) {
      status = 'mismatch';
      reason = '现在登录的 Brightspace 账号和之前绑定的不是同一个人';
    } else if (prev.manual || namesMatch(user, bs)) {
      status = 'ok';
    } else {
      status = 'mismatch';
      reason = `注册的姓名（${user.name}）和 Brightspace 上的姓名（${bsName}）不一致`;
    }
    const changed = prev.status !== status;
    user.verify = { status, reason, bsName, bsId: status === 'ok' ? bsId || prev.bsId || '' : prev.bsId || '', uniqueName, checkedAt: now, manual: !!prev.manual };
    if (changed) db.audit(`verify-${status}`, user.email, status === 'ok' ? bsName : reason);
    db.save();
    return { user: publicUser(user) };
  });

  const testLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
  route('POST', '/api/me/test-email', async ({ req }) => {
    const { user } = authenticate(req);
    if (!verified(user)) throw new HttpError(403, '先完成 Brightspace 姓名校验', 'NOT_VERIFIED');
    if (!smtpConfigured(mailCfg())) throw new HttpError(503, '管理员还没设置发信邮箱，暂时发不了邮件', 'MAIL_OFF');
    if (!testLimit(`test:${user.id}`)) throw new HttpError(429, '一小时最多发 3 封测试邮件');
    await deliver(user.email, {
      subject: '课程助手：测试邮件',
      text: `${user.name}，你好：\n\n收到这封邮件说明截止提醒能正常发到这个邮箱。截止前 24 小时和 3 小时，课程助手会把还没交的作业 / 测验发到这里。\n\n—— 课程助手`,
      html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6"><p>${user.name.replace(/[<>&]/g, '')}，你好：</p><p>收到这封邮件说明截止提醒能正常发到这个邮箱。截止前 24 小时和 3 小时，课程助手会把还没交的作业 / 测验发到这里。</p><p style="color:#6b7280">—— 课程助手</p></div>`
    }, { kind: 'test', userId: user.id });
    return { ok: true };
  });

  route('POST', '/api/me/password', ({ req, body }) => {
    const { user, session } = authenticate(req);
    if (!verifyPassword(String(body.oldPassword || ''), user.passwordHash)) throw new HttpError(400, '原密码不对');
    const pp = passwordProblem(body.newPassword);
    if (pp) throw new HttpError(400, pp);
    user.passwordHash = hashPassword(body.newPassword);
    user.mustChangePassword = false;
    D().sessions = D().sessions.filter((s) => s.userId !== user.id || s === session); // 其他设备都退出
    db.save();
    return { ok: true };
  });

  function requireVerified(user) {
    if (!verified(user)) {
      const v = user.verify || {};
      throw new HttpError(403, v.status === 'mismatch' || v.status === 'taken' ? v.reason : '请先在电脑上的课程助手插件里登录 Brightspace，完成姓名校验', 'NOT_VERIFIED');
    }
  }

  route('GET', '/api/state', ({ req }) => {
    const { user } = authenticate(req);
    requireVerified(user);
    const s = db.readState(user.id);
    return {
      overrides: s.overrides || {}, overridesAt: s.overridesAt || 0,
      settings: s.settings || {}, settingsAt: s.settingsAt || 0,
      snapshot: s.snapshot || null, snapshotAt: s.snapshotAt || 0
    };
  });

  route('PUT', '/api/state', async ({ req, body }) => {
    const { user } = authenticate(req);
    requireVerified(user);
    // 快照里的 Brightspace 账号必须是绑定的那个
    const snapId = str(body.snapshot?.user?.id, 40);
    if (snapId && user.verify?.bsId && snapId !== user.verify.bsId) throw new HttpError(403, '现在登录的 Brightspace 账号和绑定的不是同一个人', 'NOT_VERIFIED');
    if (D().settings.flags.sync === false) throw new HttpError(403, '管理员暂时关闭了云同步', 'SYNC_OFF');
    const s = db.readState(user.id);
    let changed = false;
    if (body.overrides && typeof body.overrides === 'object' && num(body.overridesAt, 1e14) >= (s.overridesAt || 0)) {
      const clean = {};
      for (const [k, v] of Object.entries(body.overrides).slice(0, 5000)) if (typeof v === 'boolean') clean[str(k, 120)] = v;
      s.overrides = clean;
      s.overridesAt = num(body.overridesAt, 1e14);
      changed = true;
    }
    if (body.settings && typeof body.settings === 'object' && num(body.settingsAt, 1e14) >= (s.settingsAt || 0)) {
      s.settings = body.settings;
      s.settingsAt = num(body.settingsAt, 1e14);
      changed = true;
    }
    if (body.snapshot && typeof body.snapshot === 'object' && num(body.snapshotAt, 1e14) >= (s.snapshotAt || 0)) {
      s.snapshot = body.snapshot;
      s.snapshotAt = num(body.snapshotAt, 1e14);
      user.lastSyncAt = new Date().toISOString();
      const act = ((D().activity ||= {})[today()] ||= { syncs: 0, users: [] });
      act.syncs += 1;
      if (!act.users.includes(user.id)) act.users.push(user.id);
      for (const k of Object.keys(D().activity)) if (Date.now() - Date.parse(k) > 60 * DAY) delete D().activity[k];
      user.stats = {
        courses: Array.isArray(body.snapshot.courses) ? body.snapshot.courses.length : 0,
        items: Array.isArray(body.snapshot.items) ? body.snapshot.items.length : 0,
        files: Object.values(body.snapshot.materials || {}).reduce((n, m) => n + (m.files || 0), 0)
      };
      db.save();
      changed = true;
    }
    if (changed) db.writeState(user.id, s);
    return { ok: true, overridesAt: s.overridesAt || 0, settingsAt: s.settingsAt || 0, snapshotAt: s.snapshotAt || 0 };
  }, { limit: 8 * 1024 * 1024 });

  // ---------------- 管理后台 ----------------
  route('GET', '/api/admin/overview', ({ req }) => {
    authenticate(req, { admin: true });
    const users = D().users;
    const now = Date.now();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const key = today(new Date(now - i * DAY));
      const a = D().activity?.[key];
      days.push({ date: key, users: a ? a.users.length : 0, syncs: a ? a.syncs : 0 });
    }
    const t = days[days.length - 1];
    return {
      version: SERVER_VERSION,
      users: users.length,
      admins: users.filter((u) => u.role === 'admin').length,
      disabled: users.filter((u) => u.disabled).length,
      active7d: users.filter((u) => u.lastSeenAt && now - Date.parse(u.lastSeenAt) < 7 * DAY).length,
      synced24h: users.filter((u) => u.lastSyncAt && now - Date.parse(u.lastSyncAt) < DAY).length,
      newUsers7d: users.filter((u) => now - Date.parse(u.createdAt) < 7 * DAY).length,
      today: t,
      days,
      settings: publicSettingsAdmin(),
      invitesActive: D().invites.filter((i) => i.usesLeft > 0).length,
      verified: users.filter(verified).length,
      unverified: users.filter((u) => !verified(u)).length,
      mail: { configured: smtpConfigured(mailCfg()), today: D().mailStats?.[today()] || { sent: 0, failed: 0 }, lastError: (D().mailLog || []).find((m) => !m.ok)?.error || '' },
      remindersOn: users.filter((u) => verified(u) && (u.reminders?.h24 !== false || u.reminders?.h3 !== false)).length,
      sessions: D().sessions.length,
      serverTime: new Date().toISOString()
    };
  });

  route('GET', '/api/admin/users', ({ req }) => {
    authenticate(req, { admin: true });
    return {
      users: D().users.map((u) => ({
        ...publicUser(u),
        disabled: !!u.disabled,
        lastSeenAt: u.lastSeenAt,
        lastSyncAt: u.lastSyncAt,
        stats: u.stats || { courses: 0, items: 0, files: 0 },
        invitedWith: u.invitedWith,
        reminderCount: u.reminderCount || 0,
        lastReminderAt: u.lastReminderAt || null,
        sessions: D().sessions.filter((s) => s.userId === u.id).length,
        storageBytes: db.stateSize(u.id)
      }))
    };
  });

  function targetUser(id, me) {
    const u = D().users.find((x) => x.id === id);
    if (!u) throw new HttpError(404, '用户不存在');
    return u;
  }

  route('PATCH', '/api/admin/users/:id', ({ req, body, params }) => {
    const { user: me } = authenticate(req, { admin: true });
    const u = targetUser(params.id, me);
    if (u.id === me.id && (body.disabled === true || body.role === 'user')) throw new HttpError(400, '不能停用或降级你自己');
    if (body.disabled != null) {
      u.disabled = !!body.disabled;
      if (u.disabled) D().sessions = D().sessions.filter((s) => s.userId !== u.id);
      db.audit(u.disabled ? 'disable' : 'enable', me.email, u.email);
    }
    if (body.role === 'admin' || body.role === 'user') {
      if (u.role !== body.role) db.audit('role', me.email, `${u.email} → ${body.role}`);
      u.role = body.role;
    }
    if (body.firstName != null || body.lastName != null) {
      u.firstName = str(body.firstName ?? u.firstName, 40) || u.firstName;
      u.lastName = str(body.lastName ?? u.lastName, 40) || u.lastName;
      u.name = displayName(u.firstName, u.lastName);
      db.audit('rename', me.email, `${u.email} → ${u.name}`);
    }
    if (body.verify === 'approve') {
      // 姓名拼法和 Brightspace 不一样但确认是本人：手动通过，下次插件校验时绑定 Brightspace 账号
      u.verify = { ...(u.verify || {}), status: 'ok', manual: true, reason: '', checkedAt: new Date().toISOString() };
      db.audit('verify-approve', me.email, u.email);
    }
    if (body.verify === 'reset') {
      u.verify = { status: 'pending' };
      db.audit('verify-reset', me.email, u.email);
    }
    db.save();
    return { ok: true };
  });

  route('POST', '/api/admin/users/:id/reset-password', ({ req, params }) => {
    const { user: me } = authenticate(req, { admin: true });
    const u = targetUser(params.id, me);
    const pw = tempPassword();
    u.passwordHash = hashPassword(pw);
    u.mustChangePassword = true;
    D().sessions = D().sessions.filter((s) => s.userId !== u.id);
    db.audit('reset-password', me.email, u.email);
    return { password: pw };
  });

  route('POST', '/api/admin/users/:id/logout', ({ req, params }) => {
    const { user: me } = authenticate(req, { admin: true });
    const u = targetUser(params.id, me);
    D().sessions = D().sessions.filter((s) => s.userId !== u.id || (u.id === me.id && s.tokenHash === tokenHash((req.headers.authorization || '').slice(7))));
    db.audit('logout-all', me.email, u.email);
    return { ok: true };
  });

  route('DELETE', '/api/admin/users/:id', ({ req, params }) => {
    const { user: me } = authenticate(req, { admin: true });
    const u = targetUser(params.id, me);
    if (u.id === me.id) throw new HttpError(400, '不能删除你自己');
    D().users = D().users.filter((x) => x.id !== u.id);
    D().sessions = D().sessions.filter((s) => s.userId !== u.id);
    db.deleteState(u.id);
    db.audit('delete-user', me.email, u.email);
    return { ok: true };
  });

  route('GET', '/api/admin/invites', ({ req }) => {
    authenticate(req, { admin: true });
    return { invites: D().invites };
  });

  route('POST', '/api/admin/invites', ({ req, body }) => {
    const { user: me } = authenticate(req, { admin: true });
    let code;
    do { code = newInviteCode(); } while (D().invites.some((i) => i.code === code));
    const inv = { code, uses: num(body.uses, 200) || 1, usesLeft: num(body.uses, 200) || 1, note: str(body.note, 60), createdAt: new Date().toISOString(), createdBy: me.email, usedBy: [] };
    D().invites.unshift(inv);
    db.audit('invite', me.email, `${code} × ${inv.uses}`);
    return { invite: inv };
  });

  route('DELETE', '/api/admin/invites/:code', ({ req, params }) => {
    const { user: me } = authenticate(req, { admin: true });
    D().invites = D().invites.filter((i) => i.code !== params.code);
    db.audit('delete-invite', me.email, params.code);
    return { ok: true };
  });

  route('PUT', '/api/admin/settings', ({ req, body }) => {
    const { user: me } = authenticate(req, { admin: true });
    const s = D().settings;
    const before = JSON.stringify(s);
    if (['open', 'invite', 'closed'].includes(body.registration)) s.registration = body.registration;
    if (body.flags && typeof body.flags === 'object') {
      if (typeof body.flags.sync === 'boolean') s.flags.sync = body.flags.sync;
    }
    if (body.announcement != null) s.announcement = str(body.announcement, 300);
    if (body.siteUrl != null) s.siteUrl = str(body.siteUrl, 200).replace(/\/+$/, '');
    if (body.mail && typeof body.mail === 'object') {
      const m = { ...(s.mail || {}) };
      for (const k of ['host', 'user', 'from', 'fromName']) if (body.mail[k] != null) m[k] = str(body.mail[k], 120);
      if (body.mail.port != null) m.port = num(body.mail.port, 65535) || 465;
      if (['ssl', 'starttls'].includes(body.mail.secure)) m.secure = body.mail.secure;
      if (body.mail.pass) m.pass = String(body.mail.pass).replace(/\s+/g, '').slice(0, 200); // Gmail 应用专用密码带空格，去掉
      if (body.mail.clear === true) delete m.pass;
      s.mail = m;
    }
    if (JSON.stringify(s) !== before) db.audit('settings', me.email, JSON.stringify({ registration: s.registration, flags: s.flags, mail: s.mail?.host ? `${s.mail.user}@${s.mail.host}` : '' }));
    db.save();
    return { settings: publicSettingsAdmin() };
  });

  route('POST', '/api/admin/test-email', async ({ req, body }) => {
    const { user: me } = authenticate(req, { admin: true });
    const to = str(body.to, 120) || me.email;
    if (!validEmail(to)) throw new HttpError(400, '收件邮箱格式不对');
    try {
      await deliver(to, { subject: '课程助手：发信测试', text: '这是一封测试邮件，收到说明发信邮箱设置正确。\n\n—— 课程助手管理后台' }, { kind: 'admin-test' });
    } catch (e) {
      throw new HttpError(502, e.message, 'MAIL_FAILED');
    }
    return { ok: true, to };
  });

  route('GET', '/api/admin/mail-log', ({ req }) => {
    authenticate(req, { admin: true });
    return { log: (D().mailLog || []).slice(0, 50) };
  });

  route('POST', '/api/admin/run-reminders', async ({ req }) => {
    authenticate(req, { admin: true });
    return await runReminders();
  });

  route('GET', '/api/admin/audit', ({ req }) => {
    authenticate(req, { admin: true });
    return { audit: D().audit.slice(0, 100) };
  });

  // ---------------- 静态文件 ----------------
  function serveStatic(req, res, pathname) {
    let rel;
    let roots;
    if (pathname.startsWith('/lib/') || pathname === '/shared.css') {
      rel = pathname === '/shared.css' ? 'shared.css' : pathname.slice(1);
      roots = SHARED_LIB;
    } else {
      if (pathname === '/' || pathname === '') { res.writeHead(302, { location: '/m/' }); res.end(); return true; }
      if (pathname === '/admin' || pathname === '/m') { res.writeHead(302, { location: `${pathname}/` }); res.end(); return true; }
      rel = pathname === '/favicon.ico' ? 'favicon.svg' : pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
      roots = [PUBLIC];
    }
    for (const root of roots) {
      const file = path.resolve(root, rel);
      if (!file.startsWith(path.resolve(root) + path.sep)) continue;
      let stat;
      try { stat = fs.statSync(file); } catch { continue; }
      if (!stat.isFile()) continue;
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=86400', // 页面和脚本每次都检查更新，避免新页面配旧脚本
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        ...(ext === '.html' ? { 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" } : {})
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }
    return false;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(url.pathname);
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, r.limit) : {};
        const out = await r.handler({ req, res, body, params, url });
        send(res, 200, out);
        return;
      }
      if (pathname.startsWith('/api/')) throw new HttpError(404, '接口不存在');
      if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, pathname)) return;
      send(res, 404, 'Not found');
    } catch (e) {
      if (e instanceof HttpError) {
        send(res, e.status, { error: e.message, code: e.code });
      } else {
        console.error(e);
        send(res, 500, { error: '服务器出错了' });
      }
    }
  });

  // 定期清理过期会话
  const cleaner = setInterval(() => {
    const before = D().sessions.length;
    D().sessions = D().sessions.filter((s) => Date.now() - Date.parse(s.lastUsedAt) < SESSION_IDLE_DAYS * DAY);
    if (D().sessions.length !== before) db.save();
  }, 6 * 3600 * 1000);
  cleaner.unref();
  const ticker = reminderEveryMs > 0 ? setInterval(() => { runReminders().catch((e) => console.error('提醒邮件出错', e)); }, reminderEveryMs) : null;
  ticker?.unref();
  server.on('close', () => { clearInterval(cleaner); clearInterval(ticker); db.flush(); });

  return { server, db, runReminders };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  const { server, db } = createServer();
  server.listen(port, () => console.log(`课程助手后端 v${SERVER_VERSION} 已启动：http://0.0.0.0:${port}`));
  const stop = () => { db.flush(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
