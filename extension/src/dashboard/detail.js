// 作业详情抽屉：点开一项，直接看老师写的要求、附件、评分标准、分值、我的提交和成绩。
import { TYPE_LABEL, formatDue, formatRelative, formatAgo } from '../lib/format.js';
import { BASE_URL } from '../lib/api.js';
import { safeName } from '../lib/materials.js';
import { h, fill, icon, I, toast, fmtBytes } from './ui.js';

const FRESH_MS = 10 * 60 * 1000;

// ---------------- 老师写的 HTML：只留安全的标签和属性 ----------------
const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP', 'SMALL', 'MARK',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'IMG', 'FIGURE', 'FIGCAPTION', 'DIV', 'SPAN', 'SECTION', 'ARTICLE']);
const DROP = new Set(['SCRIPT', 'STYLE', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META',
  'SVG', 'MATH', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'BASE', 'FRAME', 'FRAMESET', 'APPLET', 'CANVAS', 'DIALOG']);

function safeUrl(raw, { img = false } = {}) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim(), `${BASE_URL}/`);
    if (u.protocol === 'https:' || (!img && (u.protocol === 'http:' || u.protocol === 'mailto:'))) return u.href;
  } catch { /* ignore */ }
  return null;
}

function cleanNode(src, out) {
  for (const n of src.childNodes) {
    if (n.nodeType === 3) { out.append(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.nodeName;
    if (DROP.has(tag)) continue;
    if (tag === 'IFRAME' || tag === 'VIDEO' || tag === 'AUDIO') {
      // 嵌入的视频 / 网页：换成一个链接
      const href = safeUrl(n.getAttribute('src') || n.querySelector?.('source')?.getAttribute('src'));
      if (href) out.append(h('p', {}, h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, '嵌入的内容（点这里打开）')));
      continue;
    }
    if (!KEEP.has(tag)) { cleanNode(n, out); continue; } // 不认识的标签：去掉标签，保留文字
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = safeUrl(n.getAttribute('href'));
      if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
    } else if (tag === 'IMG') {
      const src2 = safeUrl(n.getAttribute('src'), { img: true });
      if (!src2) continue;
      el.src = src2;
      el.alt = n.getAttribute('alt') || '';
      el.loading = 'lazy';
      el.referrerPolicy = 'no-referrer';
    } else if (tag === 'TD' || tag === 'TH') {
      for (const a of ['colspan', 'rowspan']) { const v = parseInt(n.getAttribute(a), 10); if (v > 1 && v < 50) el.setAttribute(a, String(v)); }
    } else if (tag === 'OL') {
      const v = parseInt(n.getAttribute('start'), 10);
      if (v > 1) el.setAttribute('start', String(v));
    }
    cleanNode(n, el);
    out.append(el);
  }
  return out;
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const frag = document.createDocumentFragment();
  cleanNode(doc.body, frag);
  return frag;
}

/** 纯文本：保留换行，网址变成链接 */
function linkify(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>"）)]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0]));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function richBlock(r) {
  if (!r) return null;
  if (r.html && r.html.replace(/<[^>]*>|&nbsp;|\s/g, '')) return h('div', { class: 'rich', 'data-no-tr': '' }, sanitizeHtml(r.html));
  if (r.text) return h('div', { class: 'rich plain', 'data-no-tr': '' }, ...linkify(r.text));
  return null;
}

// ---------------- 抽屉 ----------------
let current = null;

/**
 * opts: { store, names, colors, isDone(it) => bool, setDone(it, done), now }
 */
export function openDetail(it, opts) {
  current?.close();
  const { store, names, colors } = opts;
  const cc = colors[it.courseId] || '#888';
  const course = names[it.courseId] || '';
  const body = h('div', { class: 'drawer-body' });
  const foot = h('div', { class: 'drawer-foot' });
  const dlg = h('dialog', { class: 'drawer', 'aria-label': it.title },
    h('div', { class: 'drawer-head' },
      h('span', { class: 'course-tag', style: `--cc:${cc}` }, course),
      h('span', { class: 'muted' }, TYPE_LABEL[it.type] || '其他'),
      h('button', { type: 'button', class: 'btn ghost icon small close', 'aria-label': '关闭', title: '关闭', onClick: () => dlg.close() }, icon(I.x, 16))),
    body, foot);
  current = dlg;
  dlg.addEventListener('close', () => { if (current === dlg) current = null; dlg.remove(); });
  // 点抽屉外面的暗色区域关闭
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();

  let detail = null;
  let error = null;
  let loading = false;

  // 下载附件：和课件一样存到 下载/Brightspace/课程/作业名/
  const download = async (files) => {
    const list = files.filter((f) => f.url).map((f) => ({ url: f.url, filename: ['Brightspace', safeName(course, 60), safeName(it.title, 60), safeName(f.name)].join('/') }));
    if (!list.length) return;
    toast(list.length > 1 ? `开始下载 ${list.length} 个文件` : `开始下载 ${files[0].name}`);
    const r = await store.download(list);
    if (r?.failed?.length) toast(`${r.failed.length} 个文件下载失败`);
  };

  const paint = () => {
    const now = new Date();
    fill(body, h('h2', { class: 'd-title', 'data-no-tr': '' }, it.title), ...content(it, detail, { now, error, course, download }));
    const done = opts.isDone(it);
    fill(foot,
      h('button', { type: 'button', class: `btn${done ? '' : ' ok-btn'}`, onClick: () => { opts.setDone(it, !done); setTimeout(paint, 50); } },
        icon(I.check, 15), done ? '标为未完成' : '标记完成'),
      h('span', { class: 'spacer' }),
      detail ? h('span', { class: 'muted small d-fresh' }, loading ? '正在刷新…' : `更新于 ${formatAgo(detail.fetchedAt, now)}`) : null,
      detail && !loading ? h('button', { type: 'button', class: 'btn ghost icon small', title: '刷新', 'aria-label': '刷新', onClick: () => load() }, icon(I.refresh, 15)) : null,
      it.url ? h('a', { class: 'btn primary', href: it.url, target: '_blank', rel: 'noopener' }, icon(I.external, 15), '在 Brightspace 打开') : null);
  };

  const load = async () => {
    loading = true;
    error = null;
    paint();
    try {
      const r = await store.detail(it);
      if (r?.ok) detail = r.detail;
      else error = r || { code: 'ERROR' };
    } catch (e) {
      error = { code: 'ERROR', error: e.message };
    }
    loading = false;
    if (current === dlg) paint();
  };

  (async () => {
    const { details = {} } = await store.get(['details']);
    detail = details[it.id] || null;
    paint();
    if (!detail || Date.now() - Date.parse(detail.fetchedAt || 0) > FRESH_MS) load();
  })();
}

function fact(label, value, tone = '') {
  return value == null || value === '' ? null : h('div', { class: `fact${tone ? ` ${tone}` : ''}` }, h('dt', {}, label), h('dd', {}, value));
}

function fileRow(f, download) {
  return h('li', { class: 'd-file' },
    icon(I.file, 16),
    h('span', { class: 'fname', 'data-no-tr': '' }, f.name),
    f.size ? h('span', { class: 'muted small' }, fmtBytes(f.size)) : null,
    f.url ? h('button', { type: 'button', class: 'btn ghost icon small', title: '下载', 'aria-label': `下载：${f.name}`, onClick: () => download([f]) }, icon(I.download, 15)) : null);
}

function section(title, ...kids) {
  return h('section', { class: 'd-sec' }, h('h3', {}, title), ...kids);
}

function rubricTable(r) {
  return h('div', { class: 'rubric' },
    r.name ? h('div', { class: 'rubric-name', 'data-no-tr': '' }, r.name) : null,
    ...r.groups.map((g) => h('div', { class: 'rubric-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, g.name || '评分项'), ...g.levels.map((l) => h('th', { 'data-no-tr': '' }, l.name, l.points != null ? h('small', {}, ` ${l.points} 分`) : null)))),
      h('tbody', {}, ...g.criteria.map((c) => h('tr', {},
        h('th', { scope: 'row', 'data-no-tr': '' }, c.name),
        ...c.cells.map((cell) => h('td', {}, h('span', { 'data-no-tr': '' }, cell.text || ''), cell.points != null ? h('small', {}, `${cell.points} 分`) : null)))))))));
}

const pts = (n) => (n == null ? '' : `${Math.round(n * 100) / 100} 分`);

function content(it, d, { now, error, course, download }) {
  const out = [];
  const due = d?.due || it.due;
  const exam = it.type === 'exam';
  const hm = (iso) => { const x = new Date(iso); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const facts = [
    exam && d?.start ? fact('考试时间', h('span', {}, `${formatDue(d.start, now)}–${hm(due)}`, h('span', { class: 'muted' }, ` · ${formatRelative(d.start, now)}`))) : null,
    exam && d?.start ? null : fact(exam ? '考试时间' : '截止', h('span', {}, formatDue(due, now), h('span', { class: 'muted' }, ` · ${formatRelative(due, now)}`)), Date.parse(due) < now.getTime() ? 'danger' : Date.parse(due) - now.getTime() < 24 * 3600e3 ? 'warn' : ''),
    !exam && d?.start && Date.parse(d.start) > now.getTime() ? fact('开放', formatDue(d.start, now)) : null,
    d?.lateUntil ? fact('迟交截止', `${formatDue(d.lateUntil, now)}（截止后还能交，一般算迟交）`) : null,
    d?.closes && d.closes !== due ? fact('关闭时间', formatDue(d.closes, now)) : null,
    d?.points != null ? fact('分值', pts(d.points)) : null,
    d?.timeLimit ? fact('限时', `${d.timeLimit} 分钟`) : null,
    d?.attempts != null ? fact('次数', d.attempts === 'unlimited' ? '不限次数' : `${d.attempts} 次`) : null,
    d?.password ? fact('密码', '需要密码（老师会告诉你）') : null,
    d?.location ? fact('地点', h('span', { 'data-no-tr': '' }, d.location)) : null,
    d?.group ? fact('形式', '小组作业') : null,
    d?.submitType && d.submitType !== 'file' ? fact('提交方式', { text: '在线输入文字', paper: '纸质提交', observed: '现场考核' }[d.submitType]) : null,
    d?.fileTypes ? fact('文件类型', h('span', { 'data-no-tr': '' }, d.fileTypes.join(' '))) : null
  ].filter(Boolean);
  out.push(h('dl', { class: 'd-facts' }, ...facts));

  if (!d) {
    if (error) out.push(errorBox(error, it));
    else out.push(h('div', { class: 'd-loading' }, h('span', { class: 'sk' }), h('span', { class: 'sk w80' }), h('span', { class: 'sk w60' }), h('p', { class: 'muted' }, '正在从 Brightspace 读取作业要求…')));
    return out;
  }
  if (error) out.push(h('p', { class: 'banner-inline' }, error.code === 'AUTH_REQUIRED' ? '刷新失败：Brightspace 登录过期了，下面是之前读到的内容。' : '刷新失败，下面是之前读到的内容。'));

  // 成绩 / 反馈放最前面：出分了最想看这个
  const g = d.grade;
  const fb = d.feedback;
  if (g || fb) {
    const score = g ? (g.num != null ? `${Math.round(g.num * 100) / 100}${g.den ? ` / ${g.den}` : ''}` : g.displayed) : fb.score != null ? `${fb.score}${d.points ? ` / ${d.points}` : ''}` : '';
    out.push(section('成绩与评语',
      score ? h('div', { class: 'd-score' }, h('strong', {}, score), g?.displayed && g.num != null ? h('span', { class: 'muted' }, ` · ${g.displayed}`) : null) : null,
      richBlock(g?.comments) || richBlock(fb?.text)));
  }

  const ins = richBlock(d.instructions);
  out.push(section('要求', ins || h('p', { class: 'muted' }, it.type === 'exam' ? '老师没有在 Brightspace 上写考试说明。' : '老师没有在 Brightspace 上写说明，可能写在附件或课件里。')));

  if (d.attachments.length) {
    out.push(section(`附件（${d.attachments.length}）`,
      h('ul', { class: 'd-files' }, ...d.attachments.map((f) => fileRow(f, download))),
      d.attachments.filter((f) => f.url).length > 1 ? h('button', { type: 'button', class: 'btn small', onClick: () => download(d.attachments) }, icon(I.download, 14), '全部下载') : null));
  }
  if (d.links.length) {
    out.push(section('相关链接', h('ul', { class: 'd-files' }, ...d.links.map((l) => h('li', { class: 'd-file' }, icon(I.external, 16), h('a', { class: 'fname', href: l.url, target: '_blank', rel: 'noopener noreferrer', 'data-no-tr': '' }, l.name))))));
  }
  if (d.rubrics.length) out.push(section('评分标准', ...d.rubrics.map(rubricTable)));

  if (d.submissions.length) {
    out.push(section('我的提交',
      h('ul', { class: 'd-subs' }, ...d.submissions.map((s, i) => h('li', {},
        h('div', { class: 'd-sub-head' }, h('span', { class: 'chip ok' }, i === 0 ? '最近一次' : `第 ${d.submissions.length - i} 次`), s.at ? h('span', {}, `${formatDue(s.at, now)} 提交`) : null,
          s.at && Date.parse(s.at) > Date.parse(due) ? h('span', { class: 'chip warn' }, '迟交') : null),
        s.files.length ? h('ul', { class: 'd-files' }, ...s.files.map((f) => fileRow(f, download))) : null,
        s.comment ? h('p', { class: 'muted small', 'data-no-tr': '' }, s.comment) : null)))));
  } else if (it.source === 'dropbox' && !['submitted', 'completed'].includes(it.status)) {
    out.push(section('我的提交', h('p', { class: 'muted' }, 'Brightspace 上还没有你的提交记录。')));
  }

  if (d.empty && !d.submissions.length && !g && !fb) out.push(h('p', { class: 'muted small' }, '在 Brightspace 打开可以看到完整页面。'));
  return out;
}

function errorBox(error, it) {
  const auth = error.code === 'AUTH_REQUIRED';
  return h('div', { class: 'd-error' },
    h('strong', {}, auth ? '需要登录 Brightspace 才能读取详情' : '读不到这一项的详情'),
    h('span', { class: 'muted' }, auth ? '在 Chrome 里登录 Brightspace 后再点开就行。' : '可能是网络问题，或者老师设置了不能通过接口查看。可以直接在 Brightspace 里打开。'),
    auth ? h('a', { class: 'btn small primary', href: `${BASE_URL}/d2l/home`, target: '_blank', rel: 'noopener' }, '打开 Brightspace 登录')
      : it.url ? h('a', { class: 'btn small', href: it.url, target: '_blank', rel: 'noopener' }, '在 Brightspace 打开') : null);
}
