// 界面读写数据的统一入口。装成插件时用 chrome.storage；
// 没有 chrome.storage（直接用网页服务器打开 html）时进入演示模式，显示示例数据。
import { demoData } from './demo.js';

export const KEYS = ['data', 'status', 'overrides', 'overridesAt', 'settings', 'settingsAt', 'cloud', 'updates', 'seenAt', 'pendingUpdate'];

export function createStore() {
  const ext = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (ext) {
    return {
      demo: false,
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj),
      // 改设置：先读本机最新的再改（不用页面里可能过时的那份），并记下每一项的修改时间
      setSettings: async (patch) => {
        const { settings = {}, settingsTs = {} } = await chrome.storage.local.get(['settings', 'settingsTs']);
        const now = Date.now();
        const ts = { ...settingsTs };
        for (const k of Object.keys(patch)) ts[k] = now;
        await chrome.storage.local.set({ settings: { ...settings, ...patch }, settingsTs: ts, settingsAt: now });
      },
      onChanged: (fn) => chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') fn(changes); }),
      sync: (opts = {}) => chrome.runtime.sendMessage({ type: 'sync', ...opts }),
      cloudSync: () => chrome.runtime.sendMessage({ type: 'cloudSync' }),
      download: (files) => chrome.runtime.sendMessage({ type: 'download', files }),
      openDashboard: (view) => chrome.runtime.sendMessage({ type: 'openDashboard', view }),
      version: () => chrome.runtime.getManifest().version,
      reload: () => chrome.runtime.sendMessage({ type: 'reload' }),
      checkUpdate: () => chrome.runtime.sendMessage({ type: 'checkUpdate' }),
      verify: () => chrome.runtime.sendMessage({ type: 'verify' }),
      maybeSync: () => chrome.runtime.sendMessage({ type: 'maybeSync' }),
      applyUpdate: () => chrome.runtime.sendMessage({ type: 'applyUpdate' })
    };
  }

  const demo = demoData(new Date());
  const mem = { data: demo, status: { state: 'ok' }, overrides: {}, settings: {}, cloud: null, updates: demo.demoUpdates || [], seenAt: Date.now() - 2 * 86400000 };
  const listeners = [];
  const emit = (changes = {}) => listeners.forEach((fn) => fn(changes));
  return {
    demo: true,
    get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, mem[k]])),
    set: async (obj) => {
      Object.assign(mem, obj);
      emit(Object.fromEntries(Object.keys(obj).map((k) => [k, { newValue: obj[k] }])));
    },
    onChanged: (fn) => listeners.push(fn),
    setSettings: async (patch) => {
      mem.settings = { ...mem.settings, ...patch };
      emit({ settings: { newValue: mem.settings } });
    },
    sync: async () => {
      await new Promise((r) => setTimeout(r, 800));
      const hidden = mem.settings.hiddenCourseIds || [];
      const fresh = demoData(new Date());
      mem.data = { ...fresh, courses: fresh.courses.filter((c) => !hidden.includes(c.id)) };
      mem.status = { state: 'ok' };
      emit({ data: {}, status: {} });
      return { ok: true };
    },
    cloudSync: async () => ({ ok: false, skipped: true }),
    download: async (files) => ({ ok: files.length, failed: [] }),
    openDashboard: async (view) => { window.open(`../dashboard/dashboard.html${view ? `#${view}` : ''}`, '_blank'); },
    version: () => 'demo',
    reload: async () => location.reload(),
    checkUpdate: async () => ({ pending: null }),
    verify: async () => ({ ok: true }),
    maybeSync: async () => ({ ok: true }),
    applyUpdate: async () => location.reload()
  };
}
