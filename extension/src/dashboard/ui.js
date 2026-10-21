// 界面小工具：建 DOM（文字一律走 textContent，不拼 HTML）、图标、提示条。

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const clean = (kids) => kids.flat().filter((k) => k != null && k !== false).map((k) => (k instanceof Node ? k : String(k)));
/** 和 el.replaceChildren 一样，但会跳过 null / false（原生的会把 null 显示成文字 "null"） */
export function fill(el, ...kids) { el.replaceChildren(...clean(kids)); return el; }
/** 和 el.append 一样，但会跳过 null / false */
export function add(el, ...kids) { el.append(...clean(kids)); return el; }

const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(paths, size = 16, extra = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...extra })) svg.setAttribute(k, v);
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export const I = {
  check: ['M20 6 9 17l-5-5'],
  external: ['M14 4h6v6', 'M20 4 10 14', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  chevron: ['m9 6 6 6-6 6'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['M5 12h14', 'm13 6 6 6-6 6'],
  stop: ['M7 7h10v10H7z'],
  copy: ['M8 8h11v11H8z', 'M5 16V5h11'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 4v5h-5'],
  upload: ['M12 21V9', 'm7 14 5-5 5 5', 'M5 3h14'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v3'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  text: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z'],
  book: ['M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2.5z', 'M8 7h6', 'M8 11h4'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']
};

export function toast(msg, ms = 4000) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

export function initials(name) {
  const s = String(name || '').trim();
  if (/^[一-鿿]/.test(s)) return s.slice(0, 2);
  const stop = new Set(['to', 'and', 'of', 'the', 'in', 'for', 'a', 'an', 'introduction', 'intro', '&', '-', '–']);
  const words = s.split(/[\s:·,()/-]+/).filter((w) => w && !stop.has(w.toLowerCase()) && /[a-z]/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join('') || s.slice(0, 2)).toUpperCase();
}

export function shortDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export const EXT_COLOR = {
  pdf: '#DC2626', ppt: '#EA580C', pptx: '#EA580C', key: '#EA580C', odp: '#EA580C',
  doc: '#2563EB', docx: '#2563EB', txt: '#64748B', md: '#64748B', rtf: '#2563EB',
  xls: '#16A34A', xlsx: '#16A34A', csv: '#16A34A',
  zip: '#78716C', rar: '#78716C', '7z': '#78716C',
  ipynb: '#7C3AED', py: '#7C3AED', js: '#7C3AED', html: '#7C3AED', css: '#7C3AED', java: '#7C3AED', c: '#7C3AED', cpp: '#7C3AED',
  png: '#DB2777', jpg: '#DB2777', jpeg: '#DB2777', gif: '#DB2777', svg: '#DB2777', webp: '#DB2777',
  mp4: '#9333EA', mov: '#9333EA', mp3: '#9333EA', m4a: '#9333EA', wav: '#9333EA'
};

export function fmtBytes(b) {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(n);
}

/** 两个按钮的确认框（替代浏览器的 confirm，样式统一） */
export function confirmDialog({ title, body, ok = '确定', cancel = '取消', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog' },
        h('h2', {}, title),
        body ? h('p', { class: 'dialog-body' }, body) : null,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn', value: 'cancel' }, cancel),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, value: 'ok' }, ok))));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
