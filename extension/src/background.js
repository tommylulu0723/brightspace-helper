// 后台：每 30 分钟同步一次；更新图标角标；到期提醒、每日计划、课件 / 公告 / 成绩 / 截止时间变动提醒。
import { BASE_URL, createClient } from './lib/api.js';
import { runSync } from './lib/sync.js';
import { badgeCount, isDone, formatDue } from './lib/format.js';
import { cloud, CloudError, compactSnapshot, mergeState, publicSettings } from './lib/cloud.js';
import { diffSync, mergeUpdates, describeUpdate } from './lib/changes.js';
import { buildPlan } from './lib/plan.js';
import { unreadCount } from './lib/feed.js';
import { VERSION_NOTES, REQUIRE_LOGIN } from './config.js';
import { gateState, isBlocking } from './lib/gate.js';
import { withCustom } from './lib/custom.js';
import { tr } from './lib/i18n.js';
import { loadLang } from './lang.js';
import { parseFirstNotes } from './lib/selfupdate.js';
import { fetchDetail, putCache } from './lib/detail.js';

const ALARM = 'sync';
const SOON_ALARM = 'sync-soon';
export const SYNC_CHOICES = [5, 10, 30]; // 设置里可选的自动同步间隔（分钟）
const DEFAULT_EVERY = 10;
async function syncEvery() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return SYNC_CHOICES.includes(settings.syncEvery) ? settings.syncEvery : DEFAULT_EVERY;
}
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

// 通知和图标提示文字按界面语言翻译
async function notify(id, opts) {
  await loadLang();
  return chrome.notifications.create(id, {
    ...opts,
    title: tr(opts.title),
    message: String(opts.message || '').split('\n').map((l) => tr(l)).join('\n'),
    ...(opts.buttons ? { buttons: opts.buttons.map((b) => ({ ...b, title: tr(b.title) })) } : {})
  });
}
async function setTitleTr(o) {
  await loadLang();
  return chrome.action.setTitle({ ...o, title: tr(o.title) });
}

async function ensureAlarm() {
  const every = await syncEvery();
  const a = await chrome.alarms.get(ALARM);
  if (!a || a.periodInMinutes !== every) {
    await chrome.alarms.create(ALARM, { delayInMinutes: Math.min(1, every), periodInMinutes: every });
  }
  // Chrome 允许的最短间隔是 30 秒；每次闹钟查两次（隔 15 秒），新版本拉下来后十几秒内就会弹"检测到更新"
  const u = await chrome.alarms.get(UPDATE_ALARM);
  if (!u || u.periodInMinutes !== 0.5) await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
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
    if (pendingUpdate && !pendingUpdate.test) await chrome.storage.local.remove('pendingUpdate'); // 测试用的假更新留着，等你点
    return null;
  }
  if (pendingUpdate?.to === disk.version) return pendingUpdate;

  let notes = [];
  let notesEn = null;
  try {
    const n = parseFirstNotes(await readDisk('src/config.js'));
    if (n && n.v === disk.version) { notes = n.items; notesEn = n.en || null; }
  } catch { /* 没有更新说明也能更新 */ }
  const pending = { from: running, to: disk.version, notes, notesEn, at: new Date().toISOString() };
  const en = (await loadLang()) === 'en';
  const shown = en && notesEn ? notesEn : notes;
  await chrome.storage.local.set({ pendingUpdate: pending });

  // 打开了自动更新，或者还被挡在登录 / 姓名核对页面（这时看不到更新提示，也没什么可打断的）：直接更新
  // 直接更新、不打扰你的情况：打开了"自动安装更新"；还被挡在登录 / 核对页；或者现在根本没开着插件页面
  if (settings.autoApplyUpdate || (await locked()) || !(await openExtensionTabs()).length) { applyUpdate(); return pending; }
  refreshBadge();
  notify(`pending:${disk.version}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `检测到更新：课程助手 ${disk.version}`,
    message: shown.length ? shown.slice(0, 2).map((x) => `• ${x}`).join('\n') : `当前 ${running}，点"立即更新"几秒钟就好`,
    buttons: [{ title: '立即更新' }, { title: '稍后' }],
    requireInteraction: true,
    priority: 1
  });
  return pending;
}

// 现在开着的插件页面（汇总页等）：重启插件时 Chrome 会把它们关掉，记下来，更新完在原位置重新打开
async function openExtensionTabs() {
  try {
    const ctxs = (await chrome.runtime.getContexts?.({ contextTypes: ['TAB'] })) || [];
    const out = [];
    for (const c of ctxs) {
      if (c.tabId == null || c.tabId < 0) continue;
      let tab = null;
      try { tab = await chrome.tabs.get(c.tabId); } catch { /* 已经关了 */ }
      out.push({ url: c.documentUrl, windowId: tab?.windowId, index: tab?.index, active: !!tab?.active, pinned: !!tab?.pinned });
    }
    return out;
  } catch {
    return [];
  }
}

async function applyUpdate() {
  const { pendingUpdate } = await chrome.storage.local.get('pendingUpdate');
  const running = chrome.runtime.getManifest().version;
  const tabs = await openExtensionTabs();
  await chrome.storage.local.set({
    justUpdated: { from: running, to: pendingUpdate?.to || '', at: new Date().toISOString(), test: !!pendingUpdate?.test },
    reopenTabs: { at: Date.now(), tabs }
  });
  await chrome.storage.local.remove('pendingUpdate');
  setTimeout(() => chrome.runtime.reload(), 200);
}

async function restoreTabs() {
  const { reopenTabs } = await chrome.storage.local.get('reopenTabs');
  if (!reopenTabs) return;
  await chrome.storage.local.remove('reopenTabs');
  if (Date.now() - reopenTabs.at > 2 * 60 * 1000) return; // 太久以前的不管
  const list = [...(reopenTabs.tabs || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  await chrome.storage.local.set({ reopened: list.length });
  for (const t of list) {
    if (!t.url || !t.url.startsWith(chrome.runtime.getURL(''))) continue;
    try {
      await chrome.tabs.create({ url: t.url, windowId: t.windowId, index: t.index, active: t.active, pinned: t.pinned });
    } catch {
      try { await chrome.tabs.create({ url: t.url, active: t.active }); } catch { /* ignore */ }
    }
  }
}

async function announceUpdate() {
  await chrome.storage.local.remove('pendingUpdate');
  const { justUpdated } = await chrome.storage.local.get('justUpdated');
  if (!justUpdated) return;
  await chrome.storage.local.remove('justUpdated');
  const v = chrome.runtime.getManifest().version;
  if (justUpdated.to && justUpdated.to !== v) return;
  if (justUpdated.test) {
    const { reopened = 0 } = await chrome.storage.local.get('reopened');
    await chrome.storage.local.remove('reopened');
    notify(`updated:${v}`, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '✓ 测试成功：更新流程正常',
      message: reopened ? `插件已重新加载，${reopened} 个页面已在原位置重新打开。真正有新版本时就是这样。` : '插件已重新加载。真正有新版本时就是这样（当时没开着插件页面，所以没有需要恢复的页面）。',
      priority: 1
    });
    return;
  }
  let note = '';
  const n = VERSION_NOTES.find((x) => x.v === v);
  if (n) note = ((await loadLang()) === 'en' && n.en ? n.en : n.items).slice(0, 2).map((x) => `• ${x}`).join('\n');
  notify(`updated:${v}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `✓ 已更新到 ${v}`,
    message: note || '点这里看更新了什么',
    priority: 0
  });
}

// 图标左上角的紫色小圆点 = 有未读动态（右下角的数字被红色的紧急数占着时，靠它提醒有新公告）
const iconCache = {};
let iconDot = null;
async function iconWithDot(size) {
  if (iconCache[size]) return iconCache[size];
  const res = await fetch(chrome.runtime.getURL(`icons/icon${size}.png`));
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, size, size);
  const r = size * 0.19;
  const x = r + size * 0.02;
  const y = r + size * 0.02;
  g.beginPath(); g.arc(x, y, r + size * 0.06, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();   // 白边，深色图标上也看得清
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#A855F7'; g.fill();
  iconCache[size] = g.getImageData(0, 0, size, size);
  return iconCache[size];
}
async function setIconDot(on) {
  if (iconDot === on) return;
  iconDot = on;
  try {
    if (on) await chrome.action.setIcon({ imageData: { 16: await iconWithDot(16), 32: await iconWithDot(32) } });
    else await chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } });
  } catch { iconDot = null; /* 画不出来就保持原样 */ }
}

async function setStatus(patch) {
  const { status = {} } = await chrome.storage.local.get('status');
  await chrome.storage.local.set({ status: { ...status, ...patch } });
}

async function refreshBadge() {
  const got = await chrome.storage.local.get(['data', 'overrides', 'status', 'updates', 'seenAt', 'settings', 'pendingUpdate']);
  const { overrides = {}, status = {}, updates = [], seenAt = 0, settings = {}, pendingUpdate } = got;
  const data = withCustom(got.data, settings); // 自己添加的截止事项也算进图标数字
  if (REQUIRE_LOGIN) {
    const { cloud: c } = await chrome.storage.local.get('cloud');
    const g = gateState({ requireLogin: true, cloud: c, data });
    if (isBlocking(g.state)) {
      await setIconDot(false);
      await chrome.action.setBadgeBackgroundColor({ color: '#57068C' });
      await chrome.action.setBadgeText({ text: '!' });
      await setTitleTr({ title: g.state === 'login' ? '课程助手：请先登录' : '课程助手：需要完成 Brightspace 姓名校验' });
      return;
    }
  }
  if (status.state === 'error' && status.error?.code === 'AUTH_REQUIRED') {
    await chrome.action.setBadgeBackgroundColor({ color: '#57068C' });
    await chrome.action.setBadgeText({ text: '!' });
    await setTitleTr({ title: '课程助手：Brightspace 登录已过期，点开重新登录' });
    return;
  }
  const hidden = new Set(settings.hiddenCourseIds || []);
  const items = (data?.items || []).filter((it) => !hidden.has(it.courseId));
  const n = badgeCount(items, new Date(), overrides);
  const unread = unreadCount(data, updates, seenAt, hidden);
  // 红色数字 = 已逾期 + 48 小时内到期；没有紧急事项时，紫色数字 = 未读动态
  // 数字被红色紧急数或绿色 NEW 占着、又有未读动态时，图标上加一个紫色小圆点
  await setIconDot(!!unread && (!!n || !!pendingUpdate));
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
  await setTitleTr({ title: parts.length ? `课程助手：${parts.join('，')}` : '课程助手' });
}

// 需要登录但还没登录 / 没通过姓名校验时：照常同步（要读 Brightspace 上的姓名），但不发通知
async function locked() {
  if (!REQUIRE_LOGIN) return false;
  const { cloud: c, data } = await chrome.storage.local.get(['cloud', 'data']);
  return isBlocking(gateState({ requireLogin: true, cloud: c, data }).state);
}

// 把 Brightspace 上的姓名发给服务器核对（登录后、每次同步后都做一次）
async function verifyIdentity() {
  const { cloud: c, data } = await chrome.storage.local.get(['cloud', 'data']);
  if (!c?.token || !data?.user || !(data.user.firstName || data.user.lastName)) return null;
  try {
    const r = await cloud.verify(c.server, c.token, { firstName: data.user.firstName, lastName: data.user.lastName, identifier: data.user.id, uniqueName: data.user.uniqueName });
    const { cloud: now } = await chrome.storage.local.get('cloud');
    if (now?.token === c.token) await chrome.storage.local.set({ cloud: { ...now, user: r.user, error: null, verifyError: null } });
    return r.user.verify;
  } catch (e) {
    if (e instanceof CloudError && e.status === 401) {
      await chrome.storage.local.set({ cloud: { ...c, token: null, user: null, error: e.code === 'DISABLED' ? '账号已被管理员停用' : '登录已过期，请重新登录' } });
    } else {
      // 连不上服务器等：沿用上次的结果，不把人锁在外面，但把原因显示出来
      const { cloud: now } = await chrome.storage.local.get('cloud');
      if (now?.token === c.token) await chrome.storage.local.set({ cloud: { ...now, verifyError: e.message || String(e) } });
    }
    return null;
  }
}

// 课件、公告、成绩、截止时间有变化时发一条汇总通知
async function recordUpdates(prev, result) {
  const now = new Date();
  const events = diffSync(prev && prev.items ? prev : null, result, now);
  const { updates = [], settings = {} } = await chrome.storage.local.get(['updates', 'settings']);
  if (!events.length) return;
  await chrome.storage.local.set({ updates: mergeUpdates(updates, events, now) });
  if (settings.notifyUpdates === false || (await locked())) return;
  const hidden = new Set(settings.hiddenCourseIds || []);
  const names = Object.fromEntries((result.courses || []).map((c) => [c.id, c.name]));
  const show = events.filter((e) => !hidden.has(e.courseId));
  if (!show.length) return;
  const lines = show.slice(0, 3).map((e) => describeUpdate(e, names[e.courseId], (d) => formatDue(d, now)));
  notify(`updates:${Date.now()}`, {
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
  if (settings.notifyPlan === false || planNotifiedOn === today || (await locked())) return;
  const hidden = new Set(settings.hiddenCourseIds || []);
  const plan = buildPlan((data.items || []).filter((it) => !hidden.has(it.courseId)), now, overrides);
  await chrome.storage.local.set({ planNotifiedOn: today });
  if (!plan.length) return;
  const names = Object.fromEntries((data.courses || []).map((c) => [c.id, c.name]));
  notify(`plan:${today}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: `今日计划 · ${plan.length} 件事`,
    message: plan.slice(0, 3).map((it) => `${it.title}（${names[it.courseId] || ''}）· ${it.reason.text}`).join('\n') + (plan.length > 3 ? `\n……还有 ${plan.length - 3} 件` : ''),
    priority: 1
  });
}

async function notifyDueSoon(data) {
  const { settings = {}, overrides = {}, notified = {} } = await chrome.storage.local.get(['settings', 'overrides', 'notified']);
  if (settings.notify === false || (await locked())) return;
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
    notify(`due:${it.id}`, {
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
  notify('login', {
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
      await verifyIdentity();
      const me = await cloud.me(c.server, c.token);
      // 提醒邮件用的语言跟插件一致
      const want = st.settings?.lang || (await loadLang());
      if (me.user && me.user.lang !== want) { try { me.user = (await cloud.updateProfile(c.server, c.token, { lang: want })).user; } catch { /* 下次再说 */ } }
      if (me.user?.verify?.status !== 'ok') {
        // 没通过姓名校验：服务器不收数据，只更新账号状态
        const { cloud: cur } = await chrome.storage.local.get('cloud');
        await chrome.storage.local.set({ cloud: { ...(cur || c), user: me.user, flags: me.flags || {}, announcement: me.announcement || '', error: null } });
        await refreshBadge();
        return { ok: false, error: '还没通过 Brightspace 姓名校验', code: 'NOT_VERIFIED' };
      }
      const remote = await cloud.getState(c.server, c.token);
      // 网络请求期间你可能刚改过设置（比如移除了一门课）：合并前重新读一次本机最新的
      const fresh = await chrome.storage.local.get(['overrides', 'overridesAt', 'settings', 'settingsAt', 'settingsTs']);
      const merged = mergeState(fresh, remote);
      if (merged.changedLocal) {
        const now = await chrome.storage.local.get(['settings', 'settingsTs']);
        // 再保险一次：只覆盖合并时真正从服务器拿来的那几项
        const keep = { ...(now.settings || {}) };
        for (const [k, t] of Object.entries(merged.settingsTs || {})) if (t > ((now.settingsTs || {})[k] ?? 0)) keep[k] = merged.settings[k];
        await chrome.storage.local.set({
          overrides: merged.overrides, overridesAt: merged.overridesAt,
          settings: keep, settingsAt: merged.settingsAt, settingsTs: { ...(now.settingsTs || {}), ...merged.settingsTs }
        });
        merged.settings = keep;
      }
      const body = {
        health: await healthInfo(),
        overrides: merged.overrides, overridesAt: merged.overridesAt,
        settings: publicSettings(merged.settings, merged.settingsTs), settingsAt: merged.settingsAt
      };
      if (pushSnapshot && st.data) {
        body.snapshot = compactSnapshot(withCustom(st.data, merged.settings)); // 自己添加的也上传：手机网页和提醒邮件都能看到
        body.snapshotAt = Date.parse(st.data.lastSync) || Date.now();
      }
      await cloud.putState(c.server, c.token, body);
      await chrome.storage.local.set({ healthPushedAt: Date.now() });
      const { cloud: cur } = await chrome.storage.local.get('cloud');
      await chrome.storage.local.set({ cloud: { ...(cur || c), user: me.user, flags: me.flags || {}, announcement: me.announcement || '', lastCloudSync: new Date().toISOString(), error: null } });
      await refreshBadge();
      return { ok: true, pulled: merged.changedLocal };
    } catch (e) {
      const loggedOut = e instanceof CloudError && e.status === 401;
      const { cloud: cur } = await chrome.storage.local.get('cloud');
      const base = cur || c;
      const next = loggedOut
        ? { ...base, token: null, error: e.code === 'DISABLED' ? '账号已被管理员停用' : '登录已过期，请重新登录' }
        : e.code === 'NOT_VERIFIED' ? base : { ...base, error: e.message };
      await chrome.storage.local.set({ cloud: next });
      return { ok: false, error: e.message };
    } finally {
      cloudRunning = null;
    }
  })();
  return cloudRunning;
}

// 告诉服务器"插件还在运行，最近一次同步结果是什么"：
// 读不到 Brightspace 时数据不会上传，服务器靠这个判断"好久没同步"是因为登录过期还是电脑没开
async function healthInfo() {
  const { status = {} } = await chrome.storage.local.get('status');
  return { state: status.state || '', code: status.error?.code || '', lastAttempt: status.lastAttempt || '', version: chrome.runtime.getManifest().version };
}
async function pushHealth() {
  const { cloud: c, healthPushedAt = 0 } = await chrome.storage.local.get(['cloud', 'healthPushedAt']);
  if (!c?.token || c.user?.verify?.status !== 'ok' || Date.now() - healthPushedAt < 3600 * 1000) return;
  await chrome.storage.local.set({ healthPushedAt: Date.now() });
  try { await cloud.putState(c.server, c.token, { health: await healthInfo() }); } catch { /* 下次再说 */ }
}

function scheduleCloudPush() {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    // 正在云同步时，等它结束再推一次（之前会直接被跳过，刚改的设置要等下一次才上传）
    if (cloudRunning) cloudRunning.finally(() => cloudSync({ pushSnapshot: true }));
    else cloudSync({ pushSnapshot: true });
  }, 3000);
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
      const { settings: cur = {} } = await chrome.storage.local.get('settings');
      await notifyDueSoon(withCustom(result, cur));
      await notifyDailyPlan(withCustom(result, cur));
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
      if (!offline) pushHealth();
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
    await restoreTabs();
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
  if (a.name === UPDATE_ALARM) { checkSelfUpdate(); setTimeout(checkSelfUpdate, 15000); }
  if (a.name === ALARM) syncNow('alarm');
  if (a.name === SOON_ALARM) maybeSync('after-submit', 20 * 1000);
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
  if (area === 'local' && changes.settings && changes.settings.newValue?.syncEvery !== changes.settings.oldValue?.syncEvery) ensureAlarm();
  if (area === 'local' && (changes.overrides || changes.pendingUpdate || changes.cloud)) refreshBadge();
});

// 刚登录完 Brightspace 时，如果之前是"登录过期"状态，马上补一次同步
// ---------------- 随时同步 ----------------
// 除了定时同步，下面这些时候也会自动补一次（离上次同步太近就跳过，免得给 Brightspace 添负担）
async function maybeSync(reason, minAgeMs) {
  if (running) return running;
  const { data, status = {} } = await chrome.storage.local.get(['data', 'status']);
  const last = Math.max(Date.parse(data?.lastSync || 0) || 0, Date.parse(status.lastAttempt || 0) || 0);
  if (Date.now() - last < minAgeMs) return { ok: true, skipped: true };
  return syncNow(reason);
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url || !tab.url.startsWith(`${BASE_URL}/d2l/`)) return;
  if (/\/d2l\/login/.test(tab.url)) return;
  const { status = {} } = await chrome.storage.local.get('status');
  if (status.state === 'error' && status.error?.code === 'AUTH_REQUIRED') { syncNow('login'); return; }
  // 在 Brightspace 上交作业、做测验、发讨论之后：半分钟后同步，状态马上变成"已提交"
  if (/\/(dropbox|quizzing|discussions)\//i.test(tab.url)) { chrome.alarms.create(SOON_ALARM, { delayInMinutes: 0.5 }); return; }
  maybeSync('brightspace', 5 * 60 * 1000); // 在逛 Brightspace：超过 5 分钟没同步就补一次
});

// 电脑从休眠 / 锁屏回来
chrome.idle?.onStateChanged.addListener((state) => {
  if (state === 'active') maybeSync('wake', 3 * 60 * 1000);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sync') {
    syncNow('manual', { forceMaterials: !!msg.forceMaterials }).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'reload') {
    sendResponse({ ok: true });
    // "重新加载插件"按钮：同样记下开着的页面，重启后在原位置打开
    openExtensionTabs().then((tabs) => chrome.storage.local.set({ reopenTabs: { at: Date.now(), tabs } })).finally(() => setTimeout(() => chrome.runtime.reload(), 200));
    return false;
  }
  if (msg && msg.type === 'maybeSync') {
    // 打开插件弹窗 / 汇总页：超过 2 分钟没同步就马上同步一次
    maybeSync('open', 2 * 60 * 1000).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'verify') {
    // 还没读到 Brightspace 姓名就先同步一次（同步完会自动核对），读到了就直接核对
    chrome.storage.local.get('data').then(async ({ data }) => {
      if (!data?.user?.firstName && !data?.user?.lastName) { await syncNow('verify'); sendResponse({ ok: true }); return; }
      const v = await verifyIdentity();
      sendResponse({ ok: !!v, verify: v });
    });
    return true;
  }
  if (msg && msg.type === 'testUpdate') {
    // 测试按钮：假装检测到一个新版本，后面完全走真实的更新流程（版本号不变）
    (async () => {
      // 只有管理员能用
      const { cloud: c } = await chrome.storage.local.get('cloud');
      if (!c?.token || c.user?.role !== 'admin') { sendResponse({ ok: false, error: 'admin only' }); return; }
      const v = chrome.runtime.getManifest().version;
      const en = (await loadLang()) === 'en';
      const notes = ['这是一次测试更新：点"立即更新"后插件会重新加载', '开着的课程助手页面会在原位置自动重新打开'];
      const notesEn = ['This is a test update: click "Update now" and the extension reloads', 'Open Course Helper pages reopen in the same place automatically'];
      await chrome.storage.local.set({ pendingUpdate: { from: v, to: v, notes, notesEn, test: true, at: new Date().toISOString() } });
      refreshBadge();
      notify(`pending:${v}`, {
        type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `检测到更新：课程助手 ${v}（测试）`,
        message: (en ? notesEn : notes).map((x) => `• ${x}`).join('\n'),
        buttons: [{ title: '立即更新' }, { title: '稍后' }],
        requireInteraction: true, priority: 1
      });
      sendResponse({ ok: true });
    })();
    return true;
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
  if (msg && msg.type === 'detail' && msg.item) {
    // 点开一项：读老师写的要求、附件、评分标准，存一份在本机，下次秒开
    (async () => {
      try {
        const client = createClient({ fallbackFetcher: tabFetcher });
        await client.init();
        const d = await fetchDetail(client, msg.item);
        const { details = {} } = await chrome.storage.local.get('details');
        await chrome.storage.local.set({ details: putCache(details, msg.item.id, d) });
        sendResponse({ ok: true, detail: d });
      } catch (e) {
        sendResponse({ ok: false, code: e?.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'ERROR', error: e?.message || String(e) });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'openDashboard') {
    const hash = msg.view === 'materials' || msg.view === 'deadlines' ? `#${msg.view}` : '';
    chrome.tabs.create({ url: chrome.runtime.getURL(DASHBOARD) + hash });
    sendResponse({ ok: true });
  }
  return false;
});
