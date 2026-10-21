// 课件库：把每门课的"内容"目录整理成 章节 → 文件 的结构。

const SLIDE_EXT = new Set(['ppt', 'pptx', 'key', 'odp']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'ipynb', 'rtf', 'odt', 'tex']);
const LECTURE_RE = /lecture|slides?|notes?|week\s*\d|chapter|session|class\s*\d|handout|lec\s*\d|讲义|课件|笔记|第.{1,3}[周讲章课次]/i;

export function fileExt(name) {
  const m = String(name || '').match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : '';
}

function fileNameFromUrl(url) {
  if (!url) return '';
  try {
    const path = url.split(/[?#]/)[0];
    const last = decodeURIComponent(path.split('/').pop() || '');
    return fileExt(last) ? last : '';
  } catch {
    return '';
  }
}

const NOT_LECTURE_RE = /syllabus|rubric|instructions?|template|assignment|homework|\bhw\s*\d|problem set|\bpset|quiz|exam|solutions?|answer key|starter|大纲|作业|答案/i;

export function isLectureLike(topic, pathText) {
  if (topic.kind !== 'file') return false;
  if (NOT_LECTURE_RE.test(`${topic.title} ${topic.filename}`)) return false;
  if (SLIDE_EXT.has(topic.ext)) return true;
  return DOC_EXT.has(topic.ext) && LECTURE_RE.test(`${pathText} ${topic.title} ${topic.filename}`);
}

// Windows / macOS 都能用的文件名
export function safeName(s, max = 80) {
  let out = String(s || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(out)) out = `_${out}`;
  if (out.length > max) {
    const ext = fileExt(out);
    out = ext ? `${out.slice(0, max - ext.length - 1).trim()}.${ext}` : out.slice(0, max).trim();
  }
  return out || '未命名';
}

function topicFrom(t, ctx) {
  if (!t || t.IsHidden || t.IsBroken) return null;
  const type = String(t.TypeIdentifier || '').toLowerCase();
  const id = t.TopicId ?? t.Id;
  const url = t.Url || '';
  const isFile = type === 'file' || t.ActivityType === 1 || t.TopicType === 1;
  const isLink = type === 'link' || t.ActivityType === 2 || t.TopicType === 3;
  const modified = t.LastModifiedDate || null;
  if (isFile) {
    let filename = fileNameFromUrl(url) || t.Title || `file-${id}`;
    if (!fileExt(filename) && fileExt(t.Title)) filename = t.Title;
    return {
      id: String(id),
      title: t.Title || filename,
      kind: 'file',
      ext: fileExt(filename),
      filename,
      open: `${ctx.base}/d2l/le/content/${ctx.ou}/viewContent/${id}/View`,
      download: ctx.fileUrl(id),
      modified
    };
  }
  // 只保留外部链接（视频、Google Slides 等）；指向 Brightspace 内部工具的（测验、作业箱）不算课件
  if (isLink && /^https?:\/\//i.test(url) && !url.startsWith(`${ctx.base}/d2l/`)) {
    return { id: String(id), title: t.Title || url, kind: 'link', ext: '', filename: '', open: url, download: null, modified };
  }
  return null;
}

function walk(modules, path, ctx, out) {
  const sorted = [...(modules || [])].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
  for (const m of sorted) {
    if (m.IsHidden) continue;
    const p = [...path, m.Title || '未命名章节'];
    const topics = [...(m.Topics || [])]
      .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0))
      .map((t) => topicFrom(t, ctx))
      .filter(Boolean);
    const pathText = p.join(' ');
    for (const t of topics) t.lecture = isLectureLike(t, pathText);
    if (topics.length) out.push({ id: String(m.ModuleId ?? m.Id), path: p, topics });
    walk(m.Modules, p, ctx, out);
  }
  return out;
}

/** 内容目录接口（content/toc）的结果 → 章节列表 */
export function flattenToc(toc, ctx) {
  const modules = walk(toc?.Modules || [], [], ctx, []);
  return summarize(modules);
}

/** 备用：目录接口不可用时，用 root + structure 一层层读（限制请求数） */
export async function tocFromStructure(client, ou, maxRequests = 40) {
  let budget = maxRequests;
  async function load(moduleId) {
    if (budget-- <= 0) return { Modules: [], Topics: [] };
    const children = await client.contentStructure(ou, moduleId);
    const node = { Modules: [], Topics: [] };
    for (const c of children) {
      if (c.Type === 0) {
        const sub = await load(c.Id);
        node.Modules.push({ ModuleId: c.Id, Title: c.Title, IsHidden: c.IsHidden, Modules: sub.Modules, Topics: sub.Topics });
      } else if (c.Type === 1) {
        node.Topics.push(c);
      }
    }
    return node;
  }
  const roots = await client.contentRoot(ou);
  const Modules = [];
  for (const r of roots) {
    const sub = await load(r.Id);
    Modules.push({ ModuleId: r.Id, Title: r.Title, IsHidden: r.IsHidden, Modules: sub.Modules, Topics: sub.Topics });
  }
  return { Modules };
}

function summarize(modules) {
  let files = 0, lectures = 0, links = 0;
  for (const m of modules) {
    for (const t of m.topics) {
      if (t.kind === 'file') files++;
      else links++;
      if (t.lecture) lectures++;
    }
  }
  return { modules, files, lectures, links };
}

/** 下载时的保存路径：Brightspace/课程/章节/文件 */
export function downloadPath(courseName, modulePath, topic) {
  const parts = ['Brightspace', safeName(courseName, 60), ...modulePath.slice(0, 3).map((p) => safeName(p, 50))];
  return [...parts, safeName(topic.filename || topic.title)].join('/');
}
