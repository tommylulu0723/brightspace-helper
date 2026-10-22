// 安装完成后的引导页：Chrome 不允许别的程序直接打开 chrome://extensions，所以在这里一步步教，并提供复制按钮
const q = new URLSearchParams(location.search);
const mac = q.get('os') === 'mac' || (!q.get('os') && /Mac/i.test(navigator.platform));
let lang = q.get('lang') || (/^zh/i.test(navigator.language) ? 'zh' : 'en');
const path = q.get('path') || '';

const T = {
  zh: {
    title: '课程助手已经装好了', sub: '最后在 Chrome 里点 3 下，只需要一次',
    s1: '打开扩展程序页面', s1d: 'Chrome 不允许安装程序直接打开这个页面。点"复制"，在 Chrome 地址栏粘贴并回车。',
    s2: '打开右上角的"开发者模式"', s2d: '扩展程序页面右上角有个开关，打开它，左上角会出现"加载已解压的扩展程序"。', dev: '开发者模式',
    s3: '点"加载已解压的扩展程序"，选插件文件夹', s3d: mac ? '在弹出的窗口里按 Cmd + Shift + G，粘贴下面的路径，回车，再点"选择"。' : '在弹出窗口顶部的地址栏粘贴下面的路径，回车，再点"选择文件夹"。',
    s3h: '以前装过旧的"课程助手"的话，先在扩展程序页面把旧的移除。',
    s4: '完成！', s4d: '点 Chrome 右上角的拼图图标，把课程助手固定到工具栏。第一次打开会让你注册：First / Last name 要和 Brightspace 上一致，邮箱用来收截止提醒。以后有新版本会弹出"检测到更新"，点"立即更新"就行。',
    copy: '复制', copied: '已复制，去 Chrome 里粘贴', nopath: '（安装位置里的 extension 文件夹）',
    foot: '遇到问题？把这一页和报错截图发给开发者。'
  },
  en: {
    title: 'Course Helper is installed', sub: 'Three clicks in Chrome and you\'re done — only once',
    s1: 'Open the Extensions page', s1d: 'Chrome doesn\'t let installers open this page directly. Click "Copy", paste it into Chrome\'s address bar and press Enter.',
    s2: 'Turn on "Developer mode" (top right)', s2d: 'Flip the switch at the top right of the Extensions page. A "Load unpacked" button appears at the top left.', dev: 'Developer mode',
    s3: 'Click "Load unpacked" and pick the extension folder', s3d: mac ? 'In the dialog press Cmd + Shift + G, paste the path below, press Enter, then click "Select".' : 'Paste the path below into the address bar at the top of the dialog, press Enter, then click "Select Folder".',
    s3h: 'If you had an older "Course Helper" installed, remove it on the Extensions page first.',
    s4: 'Done!', s4d: 'Click the puzzle icon at the top right of Chrome and pin Course Helper. The first time you open it you\'ll sign up: your first/last name must match Brightspace, and your email receives deadline reminders. When a new version is out you\'ll see "Update available" — just click "Update now".',
    copy: 'Copy', copied: 'Copied — paste it in Chrome', nopath: '(the extension folder inside your install location)',
    foot: 'Having trouble? Send a screenshot of this page and the error to the developer.'
  }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2500);
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const a = document.createElement('textarea'); a.value = text; document.body.append(a); a.select();
    try { document.execCommand('copy'); } catch { /* ignore */ } a.remove();
  }
  toast(T[lang].copied);
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = T[lang].copy; }, 1800);
}

function render() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = lang === 'en' ? 'Install Course Helper · last step' : '安装课程助手 · 最后一步';
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T[lang][el.dataset.t] ?? '';
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  const p = document.getElementById('path');
  p.textContent = path || T[lang].nopath;
  document.getElementById('copyPath').hidden = !path;
}
for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', () => copy(b.dataset.copy, b));
document.getElementById('copyPath').addEventListener('click', (e) => copy(path, e.currentTarget));
for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => { lang = b.dataset.lang; render(); });
render();
