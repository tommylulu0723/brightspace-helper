// 插件的界面语言：设置里选的 > 安装时选的（lang.local.json）> Chrome 的语言
import { setLang, guessLang } from './lib/i18n.js';

export async function loadLang() {
  let l;
  try { const { settings = {} } = await chrome.storage.local.get('settings'); l = settings.lang; } catch { /* 演示模式 */ }
  if (!l) {
    try {
      const r = await fetch(chrome.runtime.getURL('lang.local.json'), { cache: 'no-store' });
      if (r.ok) l = (await r.json()).lang;
    } catch { /* 没有这个文件 */ }
  }
  if (!l) l = guessLang(globalThis.chrome?.i18n?.getUILanguage?.());
  setLang(l);
  return l === 'en' ? 'en' : 'zh';
}

// 外观：auto = 跟随系统，light / dark = 手动指定
export const THEMES = ['auto', 'light', 'dark'];
export function applyTheme(t) {
  const el = document.documentElement;
  if (t === 'light' || t === 'dark') el.dataset.theme = t; else delete el.dataset.theme;
  try { localStorage.setItem('ch_theme', t || 'auto'); } catch { /* ignore */ }
}
export async function loadTheme() {
  let t = 'auto';
  try { const { settings = {} } = await chrome.storage.local.get('settings'); t = settings.theme || 'auto'; } catch { /* 演示模式 */ }
  applyTheme(t);
  return t;
}
// 页面刚打开时先用上次的选择，避免先闪一下白色再变黑
try { const t = localStorage.getItem('ch_theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* ignore */ }
