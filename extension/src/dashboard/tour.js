// 新手引导：第一次进入时依次高亮 3 个地方。看完或跳过后不再出现（设置里可以重看）。
import { h } from './ui.js';

const STEPS = [
  { sel: '#planBox .plan, #planBox, #groups', title: '所有课的截止时间都在这里', body: '最上面是今日计划，告诉你今天先做哪几件；下面按"已逾期 / 今天 / 明天 / 7 天内"排好。' },
  { sel: '#groups .row .check, #planBox .check', title: '交了就点圆圈勾掉', body: 'Brightspace 显示已提交的会自动打勾；查不到状态的（比如有些测验），交了之后自己点一下就行。' },
  { sel: '#addBtn', title: 'presentation、自己的 deadline 点这里添加', body: 'Brightspace 上没有的事情也能加进来，会一起显示、提醒。遇到问题点右上角的 💬 反馈。' }
];

let active = null;

function place(step, i, onNext, onSkip) {
  const target = step.sel.split(',').map((s) => document.querySelector(s.trim())).find((el) => el && el.offsetParent !== null);
  if (!target) { onNext(); return; }
  target.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  const r = target.getBoundingClientRect();
  const pad = 6;
  const ring = h('div', { class: 'tour-ring', style: `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px` });
  const below = r.bottom + 220 < window.innerHeight;
  const left = Math.max(16, Math.min(r.left, window.innerWidth - 356));
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite', style: below ? `top:${r.bottom + 14}px;left:${left}px` : `top:${Math.max(16, r.top - 14 - 190)}px;left:${left}px` },
    h('div', { class: 'tour-step' }, `${i + 1} / ${STEPS.length}`),
    h('strong', {}, step.title),
    h('p', {}, step.body),
    h('div', { class: 'tour-actions' },
      h('button', { type: 'button', class: 'link-btn', onClick: onSkip }, '跳过'),
      h('button', { type: 'button', class: 'btn primary small', onClick: onNext }, i === STEPS.length - 1 ? '开始使用' : '下一步')));
  active.replaceChildren(ring, card);
  card.querySelector('.btn').focus();
}

/** 开始引导；onDone 在看完或跳过时调用 */
export function startTour(onDone) {
  if (active) return;
  active = h('div', { class: 'tour', 'aria-modal': 'true' });
  document.body.append(active);
  let i = 0;
  const finish = () => { window.removeEventListener('resize', redraw); active?.remove(); active = null; onDone?.(); };
  const next = () => { i += 1; if (i >= STEPS.length) finish(); else redraw(); };
  const redraw = () => place(STEPS[i], i, next, finish);
  window.addEventListener('resize', redraw);
  const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); finish(); } };
  document.addEventListener('keydown', esc);
  // 等页面画好再开始
  requestAnimationFrame(() => requestAnimationFrame(redraw));
}
