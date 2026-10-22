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
