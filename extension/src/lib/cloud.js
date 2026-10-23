// 和你自己的服务器通信：注册 / 登录 / 云同步 / 用量上报。
// 只同步：截止事项、课程列表、课件目录、"标记完成"记录、课程设置。
import { DEFAULT_SERVER } from '../config.js';

export class CloudError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function normalizeServer(url) {
  let s = String(url || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new CloudError('服务器地址格式不对，例如 https://study.example.com');
  }
}

async function call(server, path, { method = 'GET', token, body } = {}) {
  const base = normalizeServer(server || DEFAULT_SERVER);
  if (!base) throw new CloudError('还没填服务器地址');
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new CloudError('连不上服务器，检查地址和网络', 0, 'NETWORK');
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = data?.error || `服务器返回 ${res.status}`;
    throw new CloudError(msg, res.status, data?.code || '');
  }
  return data;
}

export const cloud = {
  info: (server) => call(server, '/api/info'),
  register: (server, body) => call(server, '/api/auth/register', { method: 'POST', body }),
  login: (server, body) => call(server, '/api/auth/login', { method: 'POST', body }),
  logout: (server, token) => call(server, '/api/auth/logout', { method: 'POST', token }).catch(() => null),
  me: (server, token) => call(server, '/api/me', { token }),
  changePassword: (server, token, body) => call(server, '/api/me/password', { method: 'POST', token, body }),
  updateProfile: (server, token, body) => call(server, '/api/me', { method: 'PATCH', token, body }),
  verify: (server, token, body) => call(server, '/api/me/verify', { method: 'POST', token, body }),
  testEmail: (server, token) => call(server, '/api/me/test-email', { method: 'POST', token }),
  getState: (server, token) => call(server, '/api/state', { token }),
  putState: (server, token, body) => call(server, '/api/state', { method: 'PUT', token, body }),
  usage: (server, token, body) => call(server, '/api/usage', { method: 'POST', token, body }).catch(() => null)
};

/** 给服务器的快照：去掉下载地址等只在本机有用的东西，控制体积 */
export function compactSnapshot(data) {
  if (!data) return null;
  const materials = {};
  for (const [cid, m] of Object.entries(data.materials || {})) {
    materials[cid] = {
      files: m.files, lectures: m.lectures, links: m.links, fetchedAt: m.fetchedAt,
      modules: (m.modules || []).map((mod) => ({
        id: mod.id, path: mod.path,
        topics: mod.topics.map((t) => ({ id: t.id, title: t.title, kind: t.kind, ext: t.ext, open: t.open, modified: t.modified, lecture: t.lecture }))
      }))
    };
  }
  return {
    user: data.user,
    lastSync: data.lastSync,
    courses: data.courses,
    allCourses: data.allCourses,
    items: (data.items || []).map(({ signals, ...rest }) => rest),
    materials
  };
}

/** 本机和服务器的"标记完成"、课程设置，谁新用谁 */
export function mergeState(local, remote) {
  const out = {};
  const lo = local.overridesAt || 0;
  const ro = remote?.overridesAt || 0;
  out.overrides = ro > lo ? remote.overrides || {} : local.overrides || {};
  out.overridesAt = Math.max(lo, ro);
  const s = mergeSettings(local, remote);
  out.settings = s.settings;
  out.settingsTs = s.ts;
  out.settingsAt = Math.max(local.settingsAt || 0, remote?.settingsAt || 0);
  out.changedLocal = ro > lo || s.changed;
  return out;
}

// 会云同步的设置项
export const SYNCED_KEYS = ['hiddenCourseIds', 'addedCourseIds', 'notify', 'lang', 'customItems', 'theme'];

/**
 * 设置逐项合并：每一项各自记修改时间（settingsTs），谁新用谁。
 * 这样在一台设备上移除课程、同时别处改了语言，两边的改动都不会被对方整份覆盖掉。
 * 旧版本上传的设置没有逐项时间，就按整份的 settingsAt 比较。
 */
export function mergeSettings(local = {}, remote = null) {
  const ls = local.settings || {};
  const lts = local.settingsTs || {};
  const lat = local.settingsAt || 0;
  const rs = remote?.settings || {};
  const rat = remote?.settingsAt || 0;
  const rts = rs._ts && typeof rs._ts === 'object' ? rs._ts : null;
  const settings = { ...ls };
  delete settings._ts;
  const ts = { ...lts };
  let changed = false;
  for (const k of SYNCED_KEYS) {
    const lt = lts[k] ?? lat;                    // 本机没有逐项时间（旧数据）：用整份的时间
    const rt = rts ? rts[k] ?? 0 : (k in rs ? rat : 0);
    if (rt > lt && JSON.stringify(rs[k]) !== JSON.stringify(ls[k])) {
      if (rs[k] === undefined) delete settings[k]; else settings[k] = rs[k];
      ts[k] = rt;
      changed = true;
    } else if (rt > lt) {
      ts[k] = rt;
    }
  }
  return { settings, ts, changed };
}

/** 要同步到服务器的设置（白名单） */
export function publicSettings(settings = {}, ts = null) {
  const out = {};
  for (const k of SYNCED_KEYS) out[k] = settings[k];
  if (ts) out._ts = Object.fromEntries(SYNCED_KEYS.map((k) => [k, ts[k] || 0]));
  return out;
}
