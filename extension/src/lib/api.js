// Brightspace (D2L Valence) 客户端。
// 用你浏览器里已经登录的 Brightspace 会话发 GET 请求，只读，不保存密码。

export const BASE_URL = 'https://brightspace.nyu.edu';

// 如果 /d2l/api/versions/ 拿不到，就用这两个比较老、几乎所有学校都支持的版本
const FALLBACK_VERSIONS = { lp: '1.26', le: '1.41' };

export class AuthRequiredError extends Error {
  constructor(message = '需要登录 Brightspace') {
    super(message);
    this.name = 'AuthRequiredError';
    this.code = 'AUTH_REQUIRED';
  }
}

export class ApiError extends Error {
  constructor(status, path) {
    super(`Brightspace 返回 ${status || '网络错误'}：${path}`);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

const LOGIN_URL_RE = /\/d2l\/login|shibboleth|\/idp\/|\/sso\/|duosecurity|login\.nyu\.edu/i;

// 把一次请求的结果（不管来自后台 fetch 还是页面里的 fetch）统一解读
export function interpretResponse(r, path) {
  const ct = (r.contentType || '').toLowerCase();
  if (r.status === 401) throw new AuthRequiredError();
  if (r.url && LOGIN_URL_RE.test(r.url)) throw new AuthRequiredError();
  if (r.status >= 200 && r.status < 300) {
    if (ct.includes('json')) {
      const text = (r.text || '').trim();
      return text ? JSON.parse(text) : null;
    }
    // 200 但返回的是网页，基本就是被转到了登录页
    if (ct.includes('html')) throw new AuthRequiredError();
    const text = (r.text || '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new AuthRequiredError(); }
  }
  throw new ApiError(r.status, path);
}

async function defaultFetch(url) {
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  return {
    status: res.status,
    url: res.url,
    contentType: res.headers.get('content-type') || '',
    text: await res.text()
  };
}

/**
 * @param {object} opts
 * @param {string} [opts.base]
 * @param {(url:string)=>Promise<{status,url,contentType,text}>} [opts.fetcher]  主请求方式（后台直接请求）
 * @param {(url:string)=>Promise<{status,url,contentType,text}>|null} [opts.fallbackFetcher] 备用方式（借用已打开的 Brightspace 标签页）
 */
export function createClient({ base = BASE_URL, fetcher = defaultFetch, fallbackFetcher = null } = {}) {
  let activeFetcher = fetcher;
  let versions = { ...FALLBACK_VERSIONS };
  let requestCount = 0;

  async function get(path) {
    const url = /^https?:\/\//.test(path) ? path : base + path;
    let r;
    try {
      requestCount++;
      r = await activeFetcher(url);
    } catch (e) {
      throw new ApiError(0, path);
    }
    return interpretResponse(r, path);
  }

  // 读 Brightspace 的普通网页（有些信息接口不给学生，比如测验作答次数）
  async function getHtml(path) {
    const url = base + path;
    let r;
    try {
      requestCount++;
      r = await activeFetcher(url);
    } catch {
      throw new ApiError(0, path);
    }
    if (r.status === 401 || (r.url && LOGIN_URL_RE.test(r.url))) throw new AuthRequiredError();
    if (r.status < 200 || r.status >= 300) throw new ApiError(r.status, path);
    return r.text || '';
  }

  // D2L 的 PagedResultSet：{ PagingInfo: { Bookmark, HasMoreItems }, Items: [] }
  async function getPagedResultSet(path) {
    const out = [];
    let bookmark = null;
    for (let page = 0; page < 50; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const p = bookmark ? `${path}${sep}bookmark=${encodeURIComponent(bookmark)}` : path;
      const data = await get(p);
      if (!data) break;
      out.push(...(data.Items || []));
      const info = data.PagingInfo || {};
      if (!info.HasMoreItems || !info.Bookmark || info.Bookmark === bookmark) break;
      bookmark = info.Bookmark;
    }
    return out;
  }

  // D2L 的 ObjectListPage：{ Next: url|null, Objects: [] }；有的接口直接返回数组
  async function getObjectList(path) {
    const out = [];
    let next = path;
    for (let page = 0; page < 50 && next; page++) {
      const data = await get(next);
      if (!data) break;
      if (Array.isArray(data)) { out.push(...data); break; }
      out.push(...(data.Objects || []));
      next = data.Next && data.Next !== next ? data.Next : null;
    }
    return out;
  }

  const lp = () => `/d2l/api/lp/${versions.lp}`;
  const le = () => `/d2l/api/le/${versions.le}`;

  return {
    get base() { return base; },
    get versions() { return { ...versions }; },
    get requestCount() { return requestCount; },
    get usingFallback() { return activeFetcher !== fetcher; },

    // 1) 查版本号 2) 确认登录状态；后台请求不带登录态时，自动换成借用标签页的方式
    async init() {
      try {
        const list = await get('/d2l/api/versions/');
        if (Array.isArray(list)) {
          for (const v of list) {
            const code = (v.ProductCode || '').toLowerCase();
            if ((code === 'lp' || code === 'le') && v.LatestVersion) versions[code] = v.LatestVersion;
          }
        }
      } catch {
        // 拿不到就用默认版本号；登录问题交给下面的 whoami 判断
      }
      try {
        return await get(`${lp()}/users/whoami`);
      } catch (e) {
        const authish = e instanceof AuthRequiredError || (e instanceof ApiError && (e.status === 403 || e.status === 0));
        if (!authish || !fallbackFetcher) throw authish ? new AuthRequiredError() : e;
      }
      activeFetcher = fallbackFetcher;
      try {
        return await get(`${lp()}/users/whoami`);
      } catch (e) {
        activeFetcher = fetcher;
        if (e instanceof ApiError && e.status !== 0 && e.status !== 403) throw e;
        throw new AuthRequiredError();
      }
    },

    myEnrollments() {
      // orgUnitTypeId=3 = Course Offering（具体的一门课）
      return getPagedResultSet(`${lp()}/enrollments/myenrollments/?orgUnitTypeId=3`);
    },

    dropboxFolders(ou) {
      return get(`${le()}/${ou}/dropbox/folders/`).then((d) => (Array.isArray(d) ? d : []));
    },

    mySubmissions(ou, folderId) {
      return get(`${le()}/${ou}/dropbox/folders/${folderId}/submissions/mysubmissions/`);
    },

    quizzes(ou) {
      return getObjectList(`${le()}/${ou}/quizzes/`);
    },

    calendarEvents(ou, from, to) {
      const q = `startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(to.toISOString())}`;
      return getObjectList(`${le()}/${ou}/calendar/events/myEvents/?${q}`);
    },

    // completion=1 表示已完成和未完成都要，好拿到 DateCompleted
    contentItems(orgUnitIds, from, to) {
      const q = [
        'completion=1',
        `orgUnitIdsCSV=${orgUnitIds.join(',')}`,
        `startDateTime=${encodeURIComponent(from.toISOString())}`,
        `endDateTime=${encodeURIComponent(to.toISOString())}`
      ].join('&');
      return getObjectList(`${le()}/content/myItems/?${q}`);
    },

    // 学生看到的测验列表网页，里面有"已用次数 / 允许次数"
    quizListPage(ou) {
      return getHtml(`/d2l/lms/quizzing/user/quizzes_list.d2l?ou=${ou}`);
    },

    // 学生看到的作业列表网页，里面有"1 Submission, 1 File"之类的状态
    dropboxListPage(ou) {
      return getHtml(`/d2l/lms/dropbox/user/folders_list.d2l?ou=${ou}`);
    },

    myGradeValues(ou) {
      return get(`${le()}/${ou}/grades/values/myGradeValues/`).then((d) => (Array.isArray(d) ? d : []));
    },

    finalGrade(ou) {
      return get(`${le()}/${ou}/grades/final/values/myGradeValue`);
    },

    news(ou, since) {
      const q = since ? `?since=${encodeURIComponent(since.toISOString())}` : '';
      return get(`${le()}/${ou}/news/${q}`).then((d) => (Array.isArray(d) ? d : []));
    },

    contentToc(ou) {
      return get(`${le()}/${ou}/content/toc`);
    },

    contentRoot(ou) {
      return get(`${le()}/${ou}/content/root/`).then((d) => (Array.isArray(d) ? d : []));
    },

    contentStructure(ou, moduleId) {
      return get(`${le()}/${ou}/content/modules/${moduleId}/structure/`).then((d) => (Array.isArray(d) ? d : []));
    },

    topicFileUrl(ou, topicId) {
      return `${base}${le()}/${ou}/content/topics/${topicId}/file`;
    }
  };
}
