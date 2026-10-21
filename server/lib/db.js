// 数据存储：零依赖，JSON 文件。
//   data/db.json            用户、登录会话、邀请码、系统设置、用量统计
//   data/state/<用户ID>.json 每个人的同步数据（截止事项快照、标记完成、课程设置）
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB = () => ({
  version: 1,
  users: [],
  sessions: [],
  invites: [],
  settings: {
    registration: 'invite',           // open = 随便注册 / invite = 要邀请码 / closed = 关闭注册
    flags: { sync: true },
    announcement: ''
  },
  activity: {},                       // 'YYYY-MM-DD' -> { syncs, users: [userId] }，保留 60 天
  audit: []
});

export function createDb(dir) {
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  const file = path.join(dir, 'db.json');
  let db = DEFAULT_DB();
  if (fs.existsSync(file)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
      const d = DEFAULT_DB();
      db = { ...d, ...loaded, settings: { ...d.settings, ...(loaded.settings || {}), flags: { ...d.settings.flags, ...(loaded.settings?.flags || {}) } } };
    } catch (e) {
      const bad = `${file}.broken-${Date.now()}`;
      fs.copyFileSync(file, bad);
      console.error(`db.json 读不了，已备份到 ${bad}，用空库启动：${e.message}`);
    }
  }

  function writeAtomic(target, text) {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, target);
  }

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 200);
  }
  function flush() {
    clearTimeout(timer);
    timer = null;
    writeAtomic(file, JSON.stringify(db));
  }

  const stateFile = (userId) => path.join(dir, 'state', `${String(userId).replace(/[^\w-]/g, '')}.json`);

  return {
    get data() { return db; },
    save,
    flush,
    readState(userId) {
      const f = stateFile(userId);
      if (!fs.existsSync(f)) return {};
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
    },
    writeState(userId, state) {
      writeAtomic(stateFile(userId), JSON.stringify(state));
    },
    deleteState(userId) {
      try { fs.unlinkSync(stateFile(userId)); } catch { /* ignore */ }
    },
    stateSize(userId) {
      try { return fs.statSync(stateFile(userId)).size; } catch { return 0; }
    },
    audit(action, by, detail = '') {
      db.audit.unshift({ at: new Date().toISOString(), action, by, detail });
      if (db.audit.length > 300) db.audit.length = 300;
      save();
    }
  };
}
