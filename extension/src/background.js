// 后台：每 30 分钟同步一次；更新图标角标；到期提醒、每日计划、课件 / 公告 / 成绩 / 截止时间变动提醒。
import { BASE_URL, createClient } from './lib/api.js';
import { runSync } from './lib/sync.js';
import { badgeCount, isDone, formatDue } from './lib/format.js';
import { cloud, CloudError, compactSnapshot, mergeState, publicSettings } from './lib/cloud.js';
import { diffSync, mergeUpdates, describeUpdate } from './lib/changes.js';
import { buildPlan } from './lib/plan.js';
import { unreadCount } from './lib/feed.js';
import { VERSION_NOTES } from './config.js';
import { parseFirstNotes } from './lib/selfupdate.js';

const ALARM = 'sync';
const PERIOD_MIN = 30;
const DASHBOARD = 'src/dashboard/dashboard.html';

// 备用请求方式：后台请求带不上登录态时，借一个已打开的 Brightspace 标签页去请求
async function tabFetcher(url) {
  const tabs = await chrome.tabs.query({ url: `${BASE_URL}/*` });
  const tab = tabs.find((t) => !t.discarded && t.status === 'complete') || tabs.find((t) => !t.discarded);
  if (!tab) throw new Error('没有打开的 Brightspace 标签页');
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (u) => {
      const r = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
      return { status: r.status, url: r.url, contentType: r.headers.get('content-type') || '', text: await r.text() };
    },
    args: [url]
  });
  if (!res || !res.result) throw new Error('标签页请求失败');
  return res.result;
}

const UPDATE_ALARM = 'self-update';

async function ensureAlarm() {
  const a = await chrome.alarms.get(ALARM);
  if (!a || a.periodInMinutes !== PERIOD_MIN) {
    await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MIN });
  }
  const u = await chrome.alarms.get(UPDATE_ALARM);
  if (!u) await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
}

// ---------------- 热更新 ----------------
// 插件文件夹是 GitHub 仓库，电脑上的定时任务每分钟 git pull 一次（新文件已经在磁盘上了）。
// 这里每分钟读一次磁盘上的 manifest.json：版本号变了 → 弹"检测到更新"，点"立即更新"重新加载，几秒钟用上新代码。
// 设置里打开"自动安装更新"则不问，直接更新。
async function readDisk(path) {
  const r = await fetch(chrome.runtime.getURL(path), { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

async function checkSelfUpdate() {
  if (chrome.runtime.getManifest().update_url) return null; // 从应用商店装的由 Chrome 自己更新
  const running = chrome.runtime.getManifest().version;
  let disk;
  try {
    disk = JSON.parse(await readDisk('manifest.json'));
    // 确认新版本的后台脚本完整可读，避免拉到一半就更新
    const bg = disk.background?.service_worker;
    if (bg && !(await readDisk(bg)).trim()) return null;
  } catch {
    return null; // 正在拉取、文件写到一半时可能读到不完整的内容，下一分钟再看
  }
  const { pendingUpdate, settings = {} } = await chrome.storage.local.get(['pendingUpdate', 'settings']);
  if (!disk?.version || disk.version === running) {
    if (pendingUpdate) await chrome.storage.local.remove('pendingUpdate');
    return null;
  }
  if (pendingUpdate?.to === disk.version) return pendingUpdate;

  let notes = [];
  try {
    const n = parseFirstNotes(await readDisk('src/config.js'));
    if (n && n.v === disk.version) notes = n.items;
  } catch { /* 没有更新说明也能更新 */ }
  const pending = { from: running, to: disk.version, notes, at: new Date().toISOString() };
  await chrome.storage.local.set({ pendingUpdate: pending });

  if (settings.autoApplyUpdate) { applyUpdate(); return pending; }
  refreshBadge();
  chrome.notifications.create(`pending:${disk.version}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `检测到更新：课程助手 ${disk.version}`,
    message: notes.length ? notes.slice(0, 2).map((x) => `• ${x}`).join('\n') : `当前 ${running}，点"立即更新"几秒钟就好`,
    buttons: [{ title: '立即更新' }, { title: '稍后' }],
    requireInteraction: true,
    priority: 1
  });
  return pending;
}

async function applyUpdate() {
  const { pendingUpdate } = await chrome.storage.local.get('pendingUpdate');
  const running = chrome.runtime.getManifest().version;
  await chrome.storage.local.set({ justUpdated: { from: running, to: pendingUpdate?.to || '', at: new Date().toISOString() } });
  await chrome.storage.local.remove('pendingUpdate');
  setTimeout(() => chrome.runtime.reload(), 200);
}

async function announceUpdate() {
  await chrome.storage.local.remove('pendingUpdate');
  const { justUpdated } = await chrome.storage.local.get('justUpdated');
  if (!justUpdated) return;
  await chrome.storage.local.remove('justUpdated');
  const v = chrome.runtime.getManifest().version;
  if (justUpdated.to && justUpdated.to !== v) return;
  let note = '';
  const n = VERSION_NOTES.find((x) => x.v === v);
  if (n) note = n.items.slice(0, 2).map((x) => `• ${x}`).join('\n');
  chrome.notifications.create(`updated:${v}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `✓ 已更新到 ${v}`,
    message: note || '点这里看更新了什么',
    priority: 0
  });
}

async function setStatus(patch) {
  const { status = {} } = await chrome.storage.local.get('status');
  await chrome.storage.local.set({ status: { ...status, ...patch } });
}

async function refreshBadge() {
  const { data, overrides = {}, status = {}, updates = [], seenAt = 0, settings = {}, pendingUpdate } = await chrome.storage.local.get(['data', 'overrides', 'status', 'updates', 'seenAt', 'settings', 'pendingUpdate']);
  if (status.state === 'error' && status.error?.code === 'AUTH_REQUIRED') {
    await chrome.action.setBadgeBackgroundColor({ color: '#57068C' });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: '课程助手：Brightspace 登录已过期，点开重新登录' });
    return;
  }
  const hidden = new Set(settings.hiddenCourseIds || []);
  const items = (data?.items || []).filter((it) => !hidden.has(it.courseId));
  const n = badgeCount(items, new Date(), overrides);
  const unread = unreadCount(data, updates, seenAt, hidden);
  // 红色数字 = 已逾期 + 48 小时内到期；没有紧急事项时，紫色数字 = 未读动态
  if (n) {
    await chrome.action.setBadgeBackgroundColor({ color: '#B91C1C' });
    await chrome.action.setBadgeText({ text: String(n) });
  } else if (pendingUpdate) {
    // 绿色 NEW = 有新版本等你点"立即更新"
    await chrome.action.setBadgeBackgroundColor({ color: '#16A34A' });
    await chrome.action.setBadgeText({ text: 'NEW' });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#57068C' });
    await chrome.action.setBadgeText({ text: unread ? String(Math.min(unread, 99)) : '' });
  }
  const parts = [];
  if (pendingUpdate) parts.push(`有新版本 ${pendingUpdate.to}`);
  if (n) parts.push(`${n} 项 48 小时内到期或已逾期`);
  if (unread) parts.push(`${unread} 条新动态`);
  await chrome.action.setTitle({ title: parts.length ? `课程助手：${parts.join('，')}` : '课程助手' });
}

// 课件、公告、成绩、截止时间有变化时发一条汇总通知
async function recordUpdates(prev, result) {
  const now = new Date();
  const events = diffSync(prev && prev.items ? prev : null, result, now);
  const { updates = [], settings = {} } = await chrome.storage.local.get(['updates', 'settings']);
  if (!events.length) return;
  await chrome.storage.local.set({ updates: mergeUpdates(updates, events, now) });
  if (settings.notifyUpdates === false) return;
  const hidden = new Set(settings.hiddenCourseIds || []);
  const names = Object.fromEntries((result.courses || []).map((c) => [c.id, c.name]));
  const show = events.filter((e) => !hidden.has(e.courseId));
  if (!show.length) return;
  const lines = show.slice(0, 3).map((e) => describeUpdate(e, names[e.courseId], (d) => formatDue(d, now)));
  chrome.notifications.create(`updates:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: show.length > 1 ? `Brightspace 有 ${show.length} 条新动态` : 'Brightspace 有新动态',
    message: lines.join('\n') + (show.length > 3 ? `\n……还有 ${show.length - 3} 条` : ''),
    priority: 1
  });
}

// 每天第一次同步（早上 8 点以后）发一条"今日计划"
async function notifyDailyPlan(data) {
  const now = new Date();
  if (now.getHours() < 8) return;
  const today = now.toLocaleDateString('en-CA');
  const { settings = {}, overrides = {}, planNotifiedOn } = await chrome.storage.local.get(['settings', 'overrides', 'planNotifiedOn']);
  if (settings.notifyPlan === false || planNotifiedOn === today) return;
  const hidden = new Set(settings.hiddenCourseIds || []);
  const plan = buildPlan((data.items || []).filter((it) => !hidden.has(it.courseId)), now, overrides);
  await chrome.storage.local.set({ planNotifiedOn: today });
  if (!plan.length) return;
  const names = Object.fromEntries((data.courses || []).map((c) => [c.id, c.name]));
  chrome.notifications.create(`plan:${today}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `今日计划 · ${plan.length} 件事`,
    message: plan.slice(0, 3).map((it) => `${it.title}（${names[it.courseId] || ''}）· ${it.reason.text}`).join('\n') + (plan.length > 3 ? `\n……还有 ${plan.length - 3} 件` : ''),
    priority: 1
  });
}

async function notifyDueSoon(data) {
  const { settings = {}, overrides = {}, notified = {} } = await chrome.storage.local.get(['settings', 'overrides', 'notified']);
  if (settings.notify === false) return;
  const now = new Date();
  const t = now.getTime();
  const names = Object.fromEntries((data.courses || []).map((c) => [c.id, c.name]));
  const next = {};
  for (const [id, due] of Object.entries(notified)) {
    if (Date.parse(due) > t - 7 * 24 * 3600 * 1000) next[id] = due; // 只保留最近的记录
  }
  for (const it of data.items || []) {
    const due = Date.parse(it.due);
    if (due <= t || due - t > 24 * 3600 * 1000) continue;
    if (isDone(it, overrides) || next[it.id] === it.due) continue;
    next[it.id] = it.due;
    chrome.notifications.create(`due:${it.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '24 小时内到期',
      message: `${it.title}\n${names[it.courseId] || ''} · ${formatDue(it.due, now)}`,
      priority: 1
    });
  }
  await chrome.storage.local.set({ notified: next });
}

async function notifyLoginExpired() {
  const { settings = {}, loginNotifiedAt } = await chrome.storage.local.get(['settings', 'loginNotifiedAt']);
  if (settings.notify === false) return;
  if (loginNotifiedAt && Date.now() - Date.parse(loginNotifiedAt) < 12 * 3600 * 1000) return;
  chrome.notifications.create('login', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Brightspace 登录已过期',
    message: '点这里打开 Brightspace 重新登录，登录后会自动继续同步。',
    priority: 1
  });
  await chrome.storage.local.set({ loginNotifiedAt: new Date().toISOString() });
}

// 课件下载：按"Brightspace/课程/章节/文件名"存到下载文件夹，一个一个来，避免一下子冲爆
let downloadQueue = Promise.resolve();
function downloadFiles(files) {
  const job = downloadQueue.then(async () => {
    let ok = 0;
    const failed = [];
    for (const f of files) {
      try {
        await chrome.downloads.download({ url: f.url, filename: f.filename, conflictAction: 'uniquify', saveAs: false });
        ok++;
      } catch (e) {
        failed.push(`${f.filename}：${e?.message || e}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { ok, failed };
  });
  downloadQueue = job.catch(() => {});
  return job;
}

// ---------------- 云同步 ----------------
let cloudRunning = null;
let cloudTimer = null;

async function cloudSync({ pushSnapshot = true } = {}) {
  if (cloudRunning) return cloudRunning;
  cloudRunning = (async () => {
    const st = await chrome.storage.local.get(['cloud', 'data', 'overrides', 'overridesAt', 'settings', 'settingsAt']);
    const c = st.cloud;
    if (!c || !c.token) return { ok: false, skipped: true };
    try {
      const me = await cloud.me(c.server, c.token);
      const remote = await cloud.getState(c.server, c.token);
      const merged = mergeState(
        { overrides: st.overrides, overridesAt: st.overridesAt, settings: st.settings, settingsAt: st.settingsAt },
        remote
      );
      if (merged.changedLocal) {
        await chrome.storage.local.set({
          overrides: merged.overrides, overridesAt: merged.overridesAt,
          settings: merged.settings, settingsAt: merged.settingsAt
        });
      }
      const body = {
        overrides: merged.overrides, overridesAt: merged.overridesAt,
        settings: publicSettings(merged.settings), settingsAt: merged.settingsAt
      };
      if (pushSnapshot && st.data) {
        body.snapshot = compactSnapshot(st.data);
        body.snapshotAt = Date.parse(st.data.lastSync) || Date.now();
      }
      await cloud.putState(c.server, c.token, body);
      await chrome.storage.local.set({ cloud: { ...c, user: me.user, flags: me.flags || {}, announcement: me.announcement || '', lastCloudSync: new Date().toISOString(), error: null } });
      return { ok: true, pulled: merged.changedLocal };
    } catch (e) {
      const loggedOut = e instanceof CloudError && e.status === 401;
      const next = loggedOut
        ? { ...c, token: null, error: e.code === 'DISABLED' ? '账号已被管理员停用' : '登录已过期，请重新登录' }
        : { ...c, error: e.message };
      await chrome.storage.local.set({ cloud: next });
      return { ok: false, error: e.message };
    } finally {
      cloudRunning = null;
    }
  })();
  return cloudRunning;
}

function scheduleCloudPush() {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => cloudSync({ pushSnapshot: false }), 3000);
}

let running = null;

function syncNow(reason, { forceMaterials = false } = {}) {
  if (running) return running;
  running = (async () => {
    const startedAt = new Date().toISOString();
    const { data: prev = {}, settings = {} } = await chrome.storage.local.get(['data', 'settings']);
    await setStatus({ state: 'syncing', reason, startedAt });
    try {
      const client = createClient({ fallbackFetcher: tabFetcher });
      const result = await runSync({ client, prev, settings, forceMaterials });
      await chrome.storage.local.set({ data: result });
      await setStatus({ state: 'ok', error: null, lastAttempt: startedAt });
      await chrome.storage.local.remove('loginNotifiedAt');
      await recordUpdates(prev, result);
      await refreshBadge();
      await notifyDueSoon(result);
      await notifyDailyPlan(result);
      cloudSync().catch(() => {});
      return { ok: true };
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const auth = !offline && e && e.code === 'AUTH_REQUIRED';
      const error = offline
        ? { code: 'OFFLINE', message: '电脑没联网，联网后会自动继续同步' }
        : { code: auth ? 'AUTH_REQUIRED' : 'ERROR', message: e?.message || String(e) };
      await setStatus({ state: 'error', error, lastAttempt: startedAt });
      await refreshBadge();
      if (auth && reason !== 'manual') await notifyLoginExpired();
      return { ok: false, error };
    } finally {
      running = null;
    }
  })();
  return running;
}

// 1.0 起去掉了 AI 助手：清掉旧版本留在本机的 API key 和对话记录
async function cleanupRemovedAi() {
  try { await chrome.storage.local.remove('ai'); } catch { /* ignore */ }
  try { indexedDB.deleteDatabase('course-helper'); } catch { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureAlarm();
  if (details.reason === 'update') {
    await cleanupRemovedAi();
    await announceUpdate();
  }
  // 动态的"已读"起点：装好之前的旧公告不算未读
  const { seenAt } = await chrome.storage.local.get('seenAt');
  if (!seenAt) await chrome.storage.local.set({ seenAt: Date.now() });
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD) });
  }
  syncNow('install');
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await chrome.storage.local.remove('pendingUpdate');
  syncNow('startup');
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === UPDATE_ALARM) checkSelfUpdate();
  if (a.name === ALARM) syncNow('alarm');
});

chrome.notifications.onButtonClicked.addListener((id, idx) => {
  if (!id.startsWith('pending:')) return;
  chrome.notifications.clear(id);
  if (idx === 0) applyUpdate();
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('pending:')) { chrome.notifications.clear(id); applyUpdate(); return; }
  const hash = id.startsWith('updates') ? '#updates' : id.startsWith('updated:') ? '#settings' : '#deadlines';
  const url = id === 'login' ? `${BASE_URL}/d2l/home` : chrome.runtime.getURL(DASHBOARD) + hash;
  chrome.tabs.create({ url });
  chrome.notifications.clear(id);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.overridesAt || changes.settingsAt)) scheduleCloudPush();
  if (area === 'local' && (changes.seenAt || changes.settings)) refreshBadge();
  if (area === 'local' && (changes.overrides || changes.pendingUpdate)) refreshBadge();
});

// 刚登录完 Brightspace 时，如果之前是"登录过期"状态，马上补一次同步
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !tab.url.startsWith(`${BASE_URL}/d2l/`)) return;
  if (/\/d2l\/login/.test(tab.url)) return;
  const { status = {} } = await chrome.storage.local.get('status');
  if (status.state === 'error' && status.error?.code === 'AUTH_REQUIRED') syncNow('login');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sync') {
    syncNow('manual', { forceMaterials: !!msg.forceMaterials }).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'reload') {
    sendResponse({ ok: true });
    setTimeout(() => chrome.runtime.reload(), 200);
    return false;
  }
  if (msg && msg.type === 'checkUpdate') {
    checkSelfUpdate().then((p) => sendResponse({ pending: p }));
    return true;
  }
  if (msg && msg.type === 'applyUpdate') {
    sendResponse({ ok: true });
    applyUpdate();
    return false;
  }
  if (msg && msg.type === 'cloudSync') {
    cloudSync().then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'download' && Array.isArray(msg.files)) {
    downloadFiles(msg.files).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'openDashboard') {
    const hash = msg.view === 'materials' || msg.view === 'deadlines' ? `#${msg.view}` : '';
    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD) + hash });
    sendResponse({ ok: true });
  }
  return false;
});
