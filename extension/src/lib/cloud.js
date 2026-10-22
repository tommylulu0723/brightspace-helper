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
  const ls = local.settingsAt || 0;
  const rs = remote?.settingsAt || 0;
  out.settings = rs > ls ? { ...local.settings, ...(remote.settings || {}) } : local.settings || {};
  out.settingsAt = Math.max(ls, rs);
  out.changedLocal = ro > lo || rs > ls;
  return out;
}

/** 要同步到服务器的设置（白名单） */
export function publicSettings(settings = {}) {
  const { hiddenCourseIds, addedCourseIds, notify } = settings;
  return { hiddenCourseIds, addedCourseIds, notify };
}
