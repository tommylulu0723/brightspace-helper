// 中英双语：界面代码照常写中文，切到 English 时由这里把显示出来的文字翻译掉。
// 好处是不用改动每一处界面代码；新加的文字只要在下面的词典里补一行。
//   - 整句：['中文', 'English']
//   - 带变量：用 {} 占位，英文里用 {0} {1}… 指定顺序（不写序号就按顺序）
//   - 变量本身也会再翻译一次（比如"3 分钟前"嵌在"已同步 · 3 分钟前"里）
// 插件、手机网页共用这一个文件（服务器从 /lib/i18n.js 提供）。

let lang = 'zh';
const CJK = /[㐀-鿿！-～、-】]/;

export function getLang() { return lang; }
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'zh';
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
}
/** 浏览器 / 系统语言是中文就用中文，否则英文 */
export function guessLang(uiLang) {
  return /^zh/i.test(uiLang || (typeof navigator !== 'undefined' ? navigator.language : '') || '') ? 'zh' : 'en';
}

const D = [
  // ---------- 通用 ----------
  ['课程助手', 'Course Helper'],
  ['确定', 'OK'], ['取消', 'Cancel'], ['保存', 'Save'], ['已保存', 'Saved'], ['打开', 'Open'], ['下载', 'Download'],
  ['添加', 'Add'], ['移除', 'Remove'], ['重试', 'Retry'], ['收起', 'Collapse'], ['管理', 'Manage'], ['设置', 'Settings'],
  ['搜索', 'Search'], ['同步', 'Sync'], ['全部', 'All'], ['全', 'All'], ['新', 'New'], ['链接', 'Link'], ['文件', 'File'],
  ['讲义', 'Lecture'], ['置顶', 'Pinned'], ['有评语', 'Has feedback'], ['管理员', 'Admin'], ['同学', 'there'],
  ['查看详情', 'View details'], ['登录 / 注册', 'Log in / Sign up'], ['去登录', 'Log in'], ['登录', 'Log in'], ['注册', 'Sign up'],
  ['退出登录', 'Log out'], ['退出', 'Log out'], ['邮箱', 'Email'], ['密码', 'Password'], ['密码（至少 8 位）', 'Password (at least 8 characters)'],
  ['邀请码', 'Invite code'], ['找管理员要，例如 ABCD-2345', 'Ask the admin, e.g. ABCD-2345'], ['找管理员要', 'Ask the admin'],
  ['显示', 'Show'], ['隐藏', 'Hide'], ['显示密码', 'Show password'],
  ['语言', 'Language'], ['语言 / Language', 'Language'],

  // ---------- 时间 ----------
  ['今天 {}', 'Today {}'], ['明天 {}', 'Tomorrow {}'], ['昨天 {}', 'Yesterday {}'],
  ['今天', 'Today'], ['明天', 'Tomorrow'], ['昨天', 'Yesterday'],
  ['{} 分钟', '{} min'], ['{} 小时', '{} h'], ['{} 天', '{} days'],
  ['还剩 {}', '{} left'], ['已过 {}', '{} ago'],
  ['{} 分钟前', '{} min ago'], ['{} 小时前', '{} h ago'], ['{} 天前', '{} days ago'],
  ['从未同步', 'Never synced'], ['从未', 'Never'], ['刚刚', 'just now'],
  ['周日', 'Sun'], ['周一', 'Mon'], ['周二', 'Tue'], ['周三', 'Wed'], ['周四', 'Thu'], ['周五', 'Fri'], ['周六', 'Sat'],
  ['{} 月 {} 日 {} · {}', '{0}/{1} {2} · {3}'], ['{} 月 {} 日 {}', '{0}/{1} {2}'],
  ['夜深了', 'Late night,'], ['早上好', 'Good morning,'], ['下午好', 'Good afternoon,'], ['晚上好', 'Good evening,'],

  // ---------- 类型 / 分组 ----------
  ['作业', 'Assignment'], ['测验', 'Quiz'], ['考试', 'Exam'], ['讨论', 'Discussion'], ['日程', 'Event'], ['其他', 'Other'],
  ['已逾期 · 确认未提交', 'Overdue · not submitted'], ['7 天内', 'Next 7 days'], ['之后', 'Later'],
  ['已截止 · 无法确认是否提交', 'Past due · status unknown'], ['最近已完成', 'Recently done'],
  ['公告', 'Announcement'], ['新课件', 'New file'], ['课件更新', 'File updated'], ['截止时间改动', 'Due date changed'],
  ['新作业', 'New assignment'], ['出分了', 'Graded'], ['成绩变动', 'Grade changed'], ['期末成绩', 'Final grade'],
  ['课件', 'Files'], ['截止时间', 'Deadlines'], ['成绩', 'Grades'], ['动态', 'Updates'], ['课件库', 'Course files'],

  // ---------- 今日计划 ----------
  ['今天考试 · {}', 'Exam today · {}'], ['{} 天后考试，开始复习', 'Exam in {} days — start reviewing'],
  ['明天考试，最后复习', 'Exam tomorrow — final review'], ['{} 小时内截止', 'Due within {} h'],
  ['今天 {} 截止', 'Due today {}'], ['明天 {} 截止', 'Due tomorrow {}'], ['{} 天后截止', 'Due in {} days'],
  ['已逾期，尽快补交', 'Overdue — submit'],
  ['{} · 今日计划', '{} · Today\'s plan'], ['今日计划', 'Today\'s plan'], ['今天先做这 {} 件事', 'Do these {} first today'],
  ['今日计划 · {} 件', 'Today\'s plan · {}'], ['今日计划 · {} 件事', 'Today\'s plan · {} tasks'],
  ['接下来 3 天没有截止事项{}', 'Nothing due in the next 3 days{}'],
  ['。可以提前看看"之后"的作业，或者休息一下。', '. Get ahead on "Later" items, or take a break.'],
  ['这几天没有要赶的', 'Nothing urgent these days'], ['件待办', 'to do'],
  ['截止前 3 天开始出现，考试提前 7 天；越急、越重要的越靠前（考试 > 作业 > 讨论）。', 'Items appear 3 days before they\'re due (exams 7 days); the more urgent and important, the higher (exam > assignment > discussion).'],
  ['还有 {} 件，全部展开', 'Show {} more'], ['标记完成：{}', 'Mark done: {}'], ['标记完成', 'Mark done'],

  // ---------- 弹窗 popup ----------
  ['立即同步', 'Sync now'], ['打开完整汇总', 'Open dashboard'], ['已同步 · {}', 'Synced · {}'], ['同步失败：{}', 'Sync failed: {}'],
  ['正在同步…', 'Syncing…'], ['尚未同步', 'Not synced yet'], ['Brightspace 没登录或登录已过期。', 'Not logged in to Brightspace, or the session expired.'],
  ['已逾期', 'Overdue'], ['48 小时内', 'Within 48 h'], ['未完成', 'Open'], ['接下来', 'Up next'],
  ['正在第一次同步…', 'Running the first sync…'], ['还没有数据，先登录 Brightspace 再同步。', 'No data yet. Log in to Brightspace, then sync.'],
  ['没有待办，休息一下。', 'Nothing to do — take a break.'],
  ['{} 条新动态：公告、新课件、截止时间改动、出分 →', '{} new updates: announcements, files, due-date changes, grades →'],
  ['检测到更新 {}（当前 {}）', 'Update available: {0} (current {1})'], ['正在更新…', 'Updating…'], ['立即更新', 'Update now'], ['稍后', 'Later'],
  ['请先登录课程助手', 'Please log in to Course Helper'], ['只有注册并通过 Brightspace 姓名校验的同学才能使用。', 'Only students who sign up and pass the Brightspace name check can use it.'],
  ['还差一步：登录 Brightspace', 'One more step: log in to Brightspace'], ['课程助手要核对一下 Brightspace 上的姓名。', 'Course Helper needs to check your name on Brightspace.'],
  ['正在核对姓名…', 'Checking your name…'], ['稍等几秒。', 'Just a few seconds.'], ['姓名和 Brightspace 不一致', 'Name doesn\'t match Brightspace'],
  ['请联系管理员。', 'Please contact the admin.'], ['这个 Brightspace 账号已经被绑定', 'This Brightspace account is already linked'],
  ['请用之前注册的账号登录，或联系管理员。', 'Log in with the account you registered before, or contact the admin.'],

  // ---------- 后台通知 ----------
  ['检测到更新：课程助手 {}', 'Update available: Course Helper {}'], ['当前 {}，点"立即更新"几秒钟就好', 'You\'re on {}. Click "Update now" — it takes a few seconds'],
  ['✓ 已更新到 {}', '✓ Updated to {}'], ['点这里看更新了什么', 'Click to see what\'s new'], ['有新版本 {}', 'New version {}'],
  ['{} 项 48 小时内到期或已逾期', '{} due within 48 h or overdue'], ['{} 条新动态', '{} new updates'], ['课程助手：{}', 'Course Helper: {}'],
  ['Brightspace 有 {} 条新动态', '{} new updates on Brightspace'], ['Brightspace 有新动态', 'New update on Brightspace'],
  ['\n……还有 {} 条', '\n…and {} more'], ['\n……还有 {} 件', '\n…and {} more'], ['24 小时内到期', 'Due within 24 hours'],
  ['Brightspace 登录已过期', 'Brightspace session expired'], ['点这里打开 Brightspace 重新登录，登录后会自动继续同步。', 'Click to log in to Brightspace again; syncing resumes automatically.'],
  ['课程助手：请先登录', 'Course Helper: please log in'], ['课程助手：需要完成 Brightspace 姓名校验', 'Course Helper: Brightspace name check needed'],
  ['课程助手：Brightspace 登录已过期，点开重新登录', 'Course Helper: Brightspace session expired — click to log in'],
  ['账号已被管理员停用', 'Your account was disabled by the admin'], ['登录已过期，请重新登录', 'Session expired, please log in again'],
  ['还没通过 Brightspace 姓名校验', 'Brightspace name check not passed yet'], ['电脑没联网，联网后会自动继续同步', 'You\'re offline; syncing resumes when you\'re back online'],
  ['需要登录 Brightspace', 'Brightspace login required'], ['Brightspace 返回 {}：{}', 'Brightspace returned {0}: {1}'],

  // ---------- 动态 ----------
  ['{}新公告《{}》', '{0}New announcement "{1}"'], ['{}新课件《{}》', '{0}New file "{1}"'], ['{}课件更新《{}》', '{0}File updated "{1}"'],
  ['{}{} 截止时间改到 {}', '{0}{1} due date moved to {2}'], ['{}新{}《{}》，{} 截止', '{0}New {1} "{2}", due {3}'],
  ['{}{} 出分了{}', '{0}{1} graded{2}'], ['{}{} 成绩改为 {}', '{0}{1} grade changed to {2}'],
  ['新上传 · {}', 'Uploaded · {}'], ['文件更新了 · {}', 'File updated · {}'], ['截止时间从 {} 改到 {}', 'Due date moved from {0} to {1}'],
  ['新{} · {} 截止', 'New {0} · due {1}'], ['出分了：{}', 'Graded: {}'], ['成绩从 {} 改为 {}', 'Grade changed from {0} to {1}'],
  ['{} · 最近的公告、新课件、截止时间改动和出分{}', '{0} · recent announcements, new files, due-date changes and grades{1}'],
  ['最近的公告、新课件、截止时间改动和出分{}', 'Recent announcements, new files, due-date changes and grades{}'],
  ['{} 条', '{}'], ['{} 个附件', '{} attachments'], ['最近 {}', 'Last {}'], ['展开全文', 'Read more'],
  ['同步一次后这里会显示各门课的公告和变化。', 'After a sync, announcements and changes for each course show up here.'],
  ['暂时没有动态', 'No updates yet'], ['最近 45 天各门课都没有公告。之后有新课件、截止时间改动、出分也会出现在这里。', 'No announcements in the last 45 days. New files, due-date changes and grades will show up here too.'],
  ['插件会在每次同步时对比，发现变化就记在这里并提醒你。', 'Each sync is compared with the last one; changes are listed here and you get notified.'],
  ['（无标题）', '(untitled)'],

  // ---------- 汇总页 ----------
  ['视图', 'Views'], ['搜索…', 'Search…'], ['从 Brightspace 同步', 'Sync from Brightspace'], ['账号与设置', 'Account & settings'],
  ['课程', 'Courses'], ['按类型筛选', 'Filter by type'], ['我的课程', 'My courses'], ['导出到日历', 'Export to calendar'],
  ['7 天内到期', 'Due in 7 days'], ['确认逾期', 'Overdue'], ['待你确认', 'Needs your check'], ['隐藏已完成', 'Hide done'],
  ['只看讲义', 'Lectures only'], ['重新读取课件', 'Reload files'], ['课程管理、通知和账号', 'Courses, notifications and account'],
  ['{} 分钟前同步', 'Synced {} min ago'], ['{} 小时前同步', 'Synced {} h ago'], ['{} 天前同步', 'Synced {} days ago'], ['刚刚同步', 'Synced just now'], ['{} · 设置', '{} · Settings'], ['检测到更新：{} → {}', 'Update available: {0} → {1}'],
  ['移除课程：{}', 'Remove course: {}'], ['移除「{}」？', 'Remove "{}"?'], ['已移除 {}', 'Removed {}'], ['全部 {} 门课', 'All {} courses'],
  ['{} 项', '{} items'], ['下载 {} 个文件？', 'Download {} files?'], ['会保存到 下载/Brightspace/{}/', 'They\'ll be saved to Downloads/Brightspace/{}/'],
  ['开始下载 {} 个文件 → 下载/Brightspace/{}/', 'Downloading {0} files → Downloads/Brightspace/{1}/'],
  ['{} 个下载成功，{} 个失败（可能需要先登录 Brightspace）', '{0} downloaded, {1} failed (you may need to log in to Brightspace first)'],
  ['{} 门课 · {} 个文件 · 点课程查看章节', '{0} courses · {1} files · click a course to see modules'],
  ['最近更新：{}（{}）', 'Last updated: {0} ({1})'], ['讲义（{}）', 'Lectures ({})'], ['全部（{}）', 'All ({})'],
  ['{} 个文件 · {} 份讲义{}', '{0} files · {1} lectures{2}'], [' · {}读取', ' · read {}'], ['{}读取', 'read {}'],
  ['下载全部讲义（{}）', 'Download all lectures ({})'], ['下载全部（{}）', 'Download all ({})'], ['更新于 {}', 'Updated {}'],
  ['在 Brightspace 打开：{}', 'Open in Brightspace: {}'], ['下载：{}', 'Download: {}'],
  ['期末成绩：{}', 'Final grade: {}'], ['{} 项已出分{}', '{0} graded{1}'], [' · {} 项已出分', ' · {} graded'], ['{} 出分', 'graded {}'],
  ['已导出 {} 项，打开文件即可导入日历', 'Exported {} items — open the file to add them to your calendar'],
  ['搜索课件…', 'Search files…'], ['搜索公告、动态…', 'Search updates…'], ['搜索作业、测验…', 'Search assignments, quizzes…'],
  ['重新登录', 'Log in again'], ['设置与登录', 'Settings & login'],
  ['Brightspace 还没登录或登录已过期，暂时同步不了。登录后会自动继续。', 'Not logged in to Brightspace (or the session expired), so syncing is paused. It resumes after you log in.'],
  ['打开 Brightspace 登录', 'Log in to Brightspace'], ['全部课程', 'All courses'], ['移除这门课', 'Remove this course'],
  ['不再同步这门课的截止时间和课件。之后可以在 设置 → 课程管理 里加回来。', 'Its deadlines and files will no longer sync. You can add it back in Settings → Courses.'],
  ['还没有数据', 'No data yet'], ['通常十几秒就好。', 'Usually takes a few seconds.'], ['先在浏览器里登录 Brightspace，然后点"同步"。', 'Log in to Brightspace in this browser, then click "Sync".'],
  ['这里没有待办', 'Nothing to do here'], ['换个筛选条件，或者休息一下。', 'Try another filter, or take a break.'],
  ['Brightspace 上确认没有提交记录', 'Brightspace shows no submission'], ['插件查不到这些的提交状态。交了的话点左边圆圈标记一下', 'Submission status isn\'t available for these. If you submitted, tick the circle on the left'],
  ['手动标记完成', 'Marked done'], ['已提交', 'Submitted'], ['已完成', 'Done'], ['待确认', 'Unconfirmed'], ['标为未完成', 'Mark as not done'],
  ['没有可以下载的文件', 'Nothing to download'], ['开始下载', 'Download'],
  ['登录 Brightspace 并同步后，这里会按课程和章节列出所有课件。', 'After you log in to Brightspace and sync, all course files are listed here by course and module.'],
  ['个文件', 'files'], ['份讲义', 'lectures'], ['个链接', 'links'], ['还没读到课件', 'No files yet'], ['查看章节', 'View modules'],
  ['还没读到这门课的课件，点"重新读取课件"试试', 'No files for this course yet — try "Reload files"'],
  ['没有符合条件的课件', 'No matching files'], ['暂无课件', 'No files'], ['关掉"只看讲义"可以看到全部文件。', 'Turn off "Lectures only" to see all files.'],
  ['老师可能还没上传，或者课件放在别的地方（比如 Google Drive 链接）。', 'The instructor may not have uploaded anything yet, or files live elsewhere (e.g. a Google Drive link).'],
  ['下载本章', 'Download module'],
  ['同步一次后这里会显示各门课的成绩。', 'After a sync, grades for each course show up here.'], ['还没读取成绩', 'Grades not loaded yet'],
  ['点右上角"同步"，这一版开始会顺便读取成绩。', 'Click "Sync" at the top right to load grades.'],
  ['期末成绩（老师已公布）', 'Final grade (released)'], ['已出分项目的得分率', 'Score on graded items'], ['还没有出分', 'Nothing graded yet'],
  ['项已出分', 'graded'], ['"得分率"是把已出分项目的分数直接加总算的，没算各项权重，只作参考；以 Brightspace 成绩册为准。', '"Score" is a simple sum of graded items without weights — for reference only; Brightspace\'s gradebook is authoritative.'],
  ['最近出分', 'Recently graded'], ['还没有出分的项目。', 'No graded items yet.'], ['在 Brightspace 打开成绩册', 'Open gradebook in Brightspace'],
  ['这门课还没有出分', 'Nothing graded in this course yet'], ['老师发布成绩后，下一次同步就会出现在这里，并提醒你。', 'Once grades are released, they\'ll show up here after the next sync and you\'ll be notified.'],
  ['得分率', 'Score'], ['{} 项已出分 · 得分率 {}%（未算权重，仅供参考）', '{0} graded · score {1}% (unweighted, for reference)'],
  ['没有未来的待办可以导出', 'No upcoming items to export'], ['诊断信息已复制，直接粘贴给我就行', 'Diagnostics copied — paste them to the developer'],
  ['复制失败，请再点一次', 'Copy failed, please try again'], ['正在重新读取所有课程的课件…', 'Reloading files for all courses…'],
  ['未命名', 'Untitled'], ['未命名章节', 'Untitled module'],

  // ---------- 登录门禁 ----------
  ['已登录 {} ·', 'Logged in as {} ·'], ['欢迎回来，{}', 'Welcome back, {}'],
  ['你的 Brightspace 显示的是：{} {}。英文名、拼写和顺序都要一样，不一致的话注册后也无法使用。', 'Your Brightspace shows: {0} {1}. Spelling and order must match exactly, otherwise your account can\'t be used.'],
  ['注册成功，正在和 Brightspace 核对姓名…', 'Signed up! Checking your name against Brightspace…'],
  ['你好 {}！课程助手要读一下 Brightspace 上你的姓名，确认和注册的（{}）一致。', 'Hi {0}! Course Helper needs to read your name on Brightspace to confirm it matches the one you registered ({1}).'],
  ['Brightspace 上的姓名：{} {}', 'Name on Brightspace: {0} {1}'],
  ['⚠ 姓名必须和 Brightspace 上完全一致', '⚠ Your name must match Brightspace exactly'],
  ['包括英文名、拼写和顺序。插件会自动核对，不一致的话注册后也无法使用。', 'Including spelling and order. It\'s checked automatically — if it doesn\'t match, the account can\'t be used.'],
  ['截止提醒会发到这个邮箱（截止前 24 小时和 3 小时），也用它登录。', 'Deadline reminders go to this email (24 h and 3 h before), and you log in with it.'],
  ['First name 和 Last name 都要填', 'Please fill in both first and last name'],
  ['正在注册…', 'Signing up…'], ['正在登录…', 'Logging in…'], ['注册课程助手', 'Sign up for Course Helper'], ['登录课程助手', 'Log in to Course Helper'],
  ['注册后用 Brightspace 核对一次姓名就能用了。', 'After signing up, your name is checked once against Brightspace and you\'re ready to go.'],
  ['只有登录并通过 Brightspace 姓名校验的同学才能使用。', 'Only students who log in and pass the Brightspace name check can use it.'],
  ['登录或注册', 'Log in or sign up'], ['正在读取…', 'Reading…'], ['重新检查', 'Check again'],
  ['Brightspace 还没登录或登录已过期，点下面的按钮去登录，登录完回来点"重新检查"。', 'You\'re not logged in to Brightspace (or the session expired). Log in with the button below, then come back and click "Check again".'],
  ['正在读取 Brightspace…如果一直没反应，先确认 Brightspace 已经登录。', 'Reading Brightspace… If nothing happens, make sure you\'re logged in to Brightspace.'],
  ['连不上服务器时会一直停在这里，检查一下网络再点重新检查。', 'If the server can\'t be reached it stays here — check your network and click "Check again".'],
  ['这个 Brightspace 账号已经被绑定了', 'This Brightspace account is already linked'],
  ['每个 Brightspace 账号只能绑定一个课程助手账号。如果之前用别的邮箱注册过，请用那个邮箱登录；如果不是你注册的，请联系管理员。', 'Each Brightspace account can be linked to only one Course Helper account. If you signed up with another email before, log in with that one; otherwise contact the admin.'],
  ['Brightspace 账号不对', 'Wrong Brightspace account'],
  ['现在 Chrome 里登录的 Brightspace 账号，和你课程助手账号绑定的不是同一个人。请换回你自己的 Brightspace 账号登录。', 'The Brightspace account logged in to Chrome isn\'t the one linked to your Course Helper account. Please log in with your own Brightspace account.'],
  ['课程助手只给本人使用：注册时填的姓名必须和 Brightspace 上的一模一样。', 'Course Helper is for the account owner only: the name you registered must match Brightspace exactly.'],
  ['注册的姓名', 'Registered name'], ['Brightspace 上的姓名', 'Name on Brightspace'],
  ['如果是拼写不同但确实是你本人（比如英文名 / 中文拼音），请联系管理员在后台修改姓名或手动通过。', 'If it\'s really you with a different spelling (e.g. an English name vs. pinyin), ask the admin to fix your name or approve you manually.'],
  ['打开 Brightspace', 'Open Brightspace'],
  ['现在登录的 Brightspace 账号和绑定的不是同一个人', 'The Brightspace account logged in now isn\'t the linked one'],
  ['注册的姓名（{}）和 Brightspace 上的姓名（{}）不一致', 'Registered name ({0}) doesn\'t match the name on Brightspace ({1})'],
  ['这个 Brightspace 账号已经绑定了另一个课程助手账号', 'This Brightspace account is already linked to another Course Helper account'],
  ['请先在电脑上的课程助手插件里登录 Brightspace，完成姓名校验', 'Log in to Brightspace in the Course Helper extension on your computer to finish the name check'],
  ['邮箱或密码不对', 'Wrong email or password'], ['这个邮箱已经注册过了，直接登录就行', 'This email is already registered — just log in'],
  ['邮箱格式不对', 'Invalid email address'], ['密码至少 8 位', 'Password must be at least 8 characters'],
  ['请填写 First name 和 Last name（要和 Brightspace 上的一致）', 'Please fill in first and last name (matching Brightspace)'],
  ['需要邀请码，找管理员要一个', 'An invite code is required — ask the admin'], ['邀请码不对或已经用完了', 'Invalid or used-up invite code'],
  ['管理员暂时关闭了注册', 'Sign-up is closed by the admin'], ['尝试次数太多，过 15 分钟再试', 'Too many attempts, try again in 15 minutes'],
  ['连不上服务器，检查地址和网络', 'Can\'t reach the server — check the address and your network'],

  // ---------- 设置 ----------
  ['没保存上：{}', 'Not saved: {}'], ['发到 {}，没交的作业 / 测验才会提醒；电脑关机也照样发', 'Sent to {} — only for unsubmitted work; works even when your computer is off'],
  ['测试邮件已发到 {}，没收到就看看垃圾邮件', 'Test email sent to {} — check spam if you don\'t see it'],
  ['服务器：{} · {}', 'Server: {0} · {1}'], ['{} 云同步', 'cloud-synced {}'], ['还没云同步过', 'not cloud-synced yet'], ['云同步失败：{}', 'Cloud sync failed: {}'],
  ['连不上这个服务器：{}', 'Can\'t reach this server: {}'], ['已连接：{} v{}{}', 'Connected: {0} v{1}{2}'], ['注册成功，欢迎 {}', 'Signed up — welcome, {}'],
  ['已添加 {}，正在同步…', 'Added {}, syncing…'], ['共 {} 门 · 最多同步 25 门', '{} total · up to 25 synced'],
  ['上次同步 {}', 'Last sync {}'], ['{} 项截止', '{} deadlines'], ['请求 {} 次', '{} requests'], ['{} 条提示：{}', '{0} notes: {1}'],
  ['当前版本 {}', 'Version {}'], ['已通过 Brightspace 姓名校验', 'Brightspace name check passed'], ['姓名和 Brightspace 不一致', 'Name doesn\'t match Brightspace'],
  ['Brightspace 账号已被别人绑定', 'Brightspace account linked by someone else'], ['等待 Brightspace 姓名校验', 'Waiting for Brightspace name check'],
  ['Brightspace：{}（{}）', 'Brightspace: {0} ({1})'], ['Brightspace：{}', 'Brightspace: {}'],
  ['邮件提醒', 'Email reminders'], ['截止前 24 小时', '24 h before due'], ['截止前 3 小时', '3 h before due'], ['发一封测试邮件', 'Send a test email'],
  ['云同步完成', 'Cloud sync done'], ['立即云同步', 'Cloud sync now'], ['打开手机版', 'Open mobile web'], ['打开管理后台', 'Open admin panel'],
  ['修改密码', 'Change password'], ['退出登录？', 'Log out?'], ['退出后要重新登录才能继续使用课程助手。', 'You\'ll need to log in again to keep using Course Helper.'],
  ['本机的数据和设置会保留，只是不再云同步。', 'Local data and settings are kept; cloud sync stops.'], ['已退出登录', 'Logged out'],
  ['云同步的内容：截止事项、课程列表、课件目录、"标记完成"记录、课程设置。Brightspace 的登录信息不会上传。', 'Cloud sync covers deadlines, course list, file index, "done" marks and course settings. Your Brightspace login is never uploaded.'],
  ['这个服务器还没有人注册，第一个注册的人会成为管理员。', 'No one has signed up on this server yet — the first person becomes the admin.'],
  ['管理员关闭了注册。', 'The admin has closed sign-up.'], ['服务器地址', 'Server address'],
  ['First name（和 Brightspace 一致）', 'First name (as on Brightspace)'], ['Last name（和 Brightspace 一致）', 'Last name (as on Brightspace)'],
  ['注册并登录', 'Sign up and log in'], ['先填服务器地址', 'Enter the server address first'],
  ['登录后"标记完成"和课程设置会云同步，手机上也能看截止时间，还能收到截止提醒邮件。', 'Once logged in, "done" marks and course settings sync to the cloud, you can see deadlines on your phone, and you get reminder emails.'],
  ['只在本机用的话不需要登录，所有功能都能正常使用。部署了自己的服务器后，登录可以让"标记完成"和课程设置云同步，手机上也能看截止时间。', 'No login is needed for local use. With your own server, logging in syncs "done" marks and course settings, and shows deadlines on your phone.'],
  ['原密码（管理员重置过的话填临时密码）', 'Current password (or the temporary one from the admin)'], ['新密码（至少 8 位）', 'New password (at least 8 characters)'],
  ['密码已修改，其他设备已退出登录', 'Password changed; other devices were logged out'],
  ['第一次同步后这里会列出你在 Brightspace 上的所有课程。', 'After the first sync, all your Brightspace courses are listed here.'],
  ['搜索课程名或课号…', 'Search course name or code…'], ['搜索课程', 'Search courses'], ['正在同步', 'Syncing'],
  ['本学期 · 未同步', 'This term · not synced'], ['其他学期 / 其他', 'Other terms / other'], ['自动识别为本学期', 'Detected as this term'], ['你手动添加的', 'Added by you'],
  ['移除后不再同步这门课的截止时间和课件，侧边栏里也不显示。随时可以加回来。', 'Removing stops syncing its deadlines and files and hides it from the sidebar. You can add it back anytime.'],
  ['每天早上的今日计划', 'Morning plan'], ['8 点以后第一次同步时，告诉你今天先做哪几件', 'On the first sync after 8 am, tells you what to do first today'],
  ['快到期提醒', 'Due-soon alerts'], ['24 小时内到期的事项各提醒一次；Brightspace 登录过期时提醒重新登录', 'One alert per item due within 24 h; also tells you when your Brightspace login expires'],
  ['动态提醒', 'Update alerts'], ['新公告、新课件、课件更新、截止时间改动、新作业、出分', 'New announcements, files, file updates, due-date changes, new assignments, grades'],
  ['自动安装插件更新', 'Install updates automatically'], ['关闭时：检测到新版本先弹窗问你，点"立即更新"才更新', 'When off: you\'re asked first, and it updates when you click "Update now"'],
  ['通过已打开的 Brightspace 标签页同步', 'Synced via an open Brightspace tab'], ['复制诊断信息', 'Copy diagnostics'],
  ['某项状态不对时，点这个再粘贴给开发者，里面有每一项的判断依据。', 'If something looks wrong, copy this and send it to the developer — it explains how each item was judged.'],
  ['还没同步过', 'Never synced'], ['检测到更新后没反应时点这里', 'Click this if an update doesn\'t apply'], ['重新加载插件', 'Reload extension'],
  ['热更新：电脑每分钟从 GitHub 拉取新版本，插件发现后弹出"检测到更新"，点"立即更新"几秒钟就好，不用重新装。', 'Hot updates: your computer pulls new versions from GitHub automatically; when one arrives you\'ll see "Update available" — click "Update now" and it\'s done in seconds.'],
  ['课程管理', 'Courses'], ['移除不重要的课（比如社团、培训类"课程"），或者把没被自动识别的课加回来。改完会自动重新同步截止时间和课件。', 'Remove unimportant "courses" (clubs, trainings) or add back ones that weren\'t detected. Deadlines and files re-sync automatically.'],
  ['通知', 'Notifications'], ['账号与邮件提醒', 'Account & email reminders'], ['账号与云同步（可选）', 'Account & cloud sync (optional)'],
  ['诊断', 'Diagnostics'], ['更新日志', 'Changelog'], ['检测到更新', 'Update available'],
  ['界面语言，切换后立即生效；提醒邮件也会用这个语言。', 'Interface language — applies immediately; reminder emails use it too.'],

  // ---------- 手机网页 ----------
  ['NYU Brightspace 截止时间 · 今日计划 · 邮件提醒', 'NYU Brightspace deadlines · daily plan · email reminders'],
  ['欢迎回来', 'Welcome back'], ['创建账号', 'Create account'], ['例如 Alex', 'e.g. Alex'], ['例如 Chen', 'e.g. Chen'],
  ['姓名必须和 Brightspace 上完全一致', 'Your name must match Brightspace exactly'],
  ['包括英文名、拼写和顺序。插件会自动核对，不一致的话注册后也无法使用。', 'Including spelling and order. It\'s checked automatically — if it doesn\'t match, the account can\'t be used.'],
  ['截止提醒会发到这个邮箱（截止前 24 小时和 3 小时），登录也用它。', 'Deadline reminders go to this email (24 h and 3 h before); you also log in with it.'],
  ['还没有账号？', 'No account yet?'], ['立即注册', 'Sign up'], ['已经有账号了？', 'Already have an account?'],
  ['First name 和 Last name 都要填，并且和 Brightspace 上的一致', 'Fill in first and last name, exactly as on Brightspace'],
  ['注册成功，{}！{}', 'You\'re signed up, {0}! {1}'], ['你是第一个注册的，已经是管理员。', 'You\'re the first user, so you\'re the admin.'],
  ['最后一步：在电脑的 Chrome 里打开课程助手插件，用这个邮箱和密码登录。插件会读取 Brightspace 上的姓名核对，通过后这里就能看到你的截止时间。', 'Last step: open the Course Helper extension in Chrome on your computer and log in with this email and password. It checks your name on Brightspace; once it passes, your deadlines show up here.'],
  ['我已经在插件里登录了，刷新', 'I\'ve logged in on the extension — refresh'],
  ['{}，早上好', 'Good morning, {}'], ['{}，下午好', 'Good afternoon, {}'], ['{}，晚上好', 'Good evening, {}'], ['插件 {} 分钟前同步', 'Extension synced {} min ago'], ['插件 {} 小时前同步', 'Extension synced {} h ago'], ['插件 {} 天前同步', 'Extension synced {} days ago'], ['插件 刚刚同步', 'Extension synced just now'], ['电脑上的插件还没同步过', 'The extension on your computer hasn\'t synced yet'],
  ['还没有数据。在电脑的 Chrome 插件里登录同一个账号并同步一次，这里就能看到了。', 'No data yet. Log in to the same account in the Chrome extension on your computer and sync once.'],
  ['没有待办', 'Nothing to do'], ['先做这 {} 件', 'Do these {} first'], ['邮件提醒', 'Email reminders'], [' · 发到 {}', ' · sent to {}'],
  ['还不能使用', 'Not available yet'],
  ['在电脑的 Chrome 里打开课程助手插件，登录 Brightspace 后会自动核对姓名。核对通过后刷新这个页面。', 'Open the Course Helper extension in Chrome on your computer; after you log in to Brightspace your name is checked automatically. Refresh this page once it passes.'],
  ['iPhone / iPad：在 Safari 里点"分享"→"添加到主屏幕"，用起来就像 App。', 'iPhone / iPad: in Safari tap Share → "Add to Home Screen" to use it like an app.'],
  ['Android：Chrome 菜单 →"添加到主屏幕"。勾选完成会同步回电脑上的插件。', 'Android: Chrome menu → "Add to Home screen". Items you tick off sync back to the extension.'],
  ['没保存上：{}', 'Not saved: {}'],
  ['{}（{}）· {}', '{0} ({1}) · {2}'], ['• {}', '• {}'],
  [' · {} 条新的', ' · {} new'], ['{} 条新的', '{} new'],
  ['· {}', '· {}'],
  ['外观', 'Appearance'], ['外观：跟随系统', 'Appearance: match system'], ['外观：浅色', 'Appearance: light'], ['外观：深色', 'Appearance: dark'],
  ['跟随系统', 'System'], ['浅色', 'Light'], ['深色', 'Dark'],
  ['自动同步', 'Auto sync'], ['自动同步间隔', 'Auto sync interval'], ['每 {} 分钟', 'Every {} min'],
  [' · 另外打开插件、在 Brightspace 交完作业、电脑从休眠回来时也会马上同步', ' · It also syncs right away when you open the extension, after you submit on Brightspace, and when your computer wakes up'],
  ['这个邮箱已经注册过，已帮你登录：{}', 'That email was already registered — logged you in: {}'],
  ['这个邮箱已经注册过了，请输入当时设置的密码登录。', 'This email is already registered — log in with the password you set.'],
  ['注册时名字填错了？点下面的按钮，把注册的姓名改成和 Brightspace 一样，马上重新核对。', 'Typed your name wrong when signing up? Click below to change it to match Brightspace and check again right away.'],
  ['正在修改…', 'Updating…'], ['改成 {} {}', 'Change to {0} {1}'], ['已改成 {} {}，正在重新核对…', 'Changed to {0} {1} — checking again…'],
  ['展示', 'Presentation'], ['我的事项', 'My items'], ['我添加的', 'Added by me'], ['添加截止', 'Add deadline'], ['编辑', 'Edit'], ['删除', 'Delete'], ['已删除', 'Deleted'],
  ['添加截止事项', 'Add a deadline'], ['编辑截止事项', 'Edit deadline'],
  ['比如 presentation、小组讨论、自己定的 deadline。会和 Brightspace 的截止时间一起显示、提醒，也会同步到手机和提醒邮件。', 'E.g. a presentation, group meeting or your own deadline. It shows up and gets reminders alongside Brightspace deadlines, and syncs to your phone and reminder emails.'],
  ['标题', 'Title'], ['类型', 'Type'], ['日期', 'Date'], ['时间', 'Time'], ['备注（可选）', 'Note (optional)'], ['例如 Final presentation', 'e.g. Final presentation'],
  ['例如 第 3 组，10 分钟', 'e.g. Group 3, 10 minutes'], ['我的事项（不属于某门课）', 'My items (no course)'],
  ['先写个标题', 'Please enter a title'], ['日期或时间不对', 'Invalid date or time'], ['已添加：{}', 'Added: {}'],
  ['今天展示 · {}', 'Presenting today · {}'], ['明天展示，最后准备', 'Presenting tomorrow — final prep'], ['{} 天后展示，开始准备', 'Presenting in {} days — start preparing'],
  [' · 登录后课程助手会自动读取你的课程，并核对姓名。', ' · Once you log in, Course Helper reads your courses and checks your name automatically.'],
  ['正在读取 Brightspace…', 'Reading Brightspace…'], ['读取', 'Read'],
  ['还没读取 Brightspace。确认 Chrome 里已经登录 Brightspace，然后点"读取"。', 'Brightspace hasn\'t been read yet. Make sure you\'re logged in to Brightspace in Chrome, then click "Read".'],
  ['核对姓名失败：{}', 'Name check failed: {}'], ['正在核对姓名（Brightspace：{} {}）…', 'Checking your name (Brightspace: {0} {1})…'],
];

// ---------- 编译词典 ----------
const exact = new Map();
const patterns = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [zh, en] of D) {
  if (!zh.includes('{}')) { exact.set(zh, en); continue; }
  const parts = zh.split('{}');
  const re = new RegExp(`^${parts.map(esc).join('([\\s\\S]*?)')}$`);
  let i = 0;
  const tpl = /\{\d\}/.test(en) ? en : en.replace(/\{\}/g, () => `{${i++}}`);
  // 文字一样多时，开头就是固定文字的句型优先（它通常是外层，比如"已过 {}"包着"15 小时"）
  patterns.push({ re, tpl, weight: parts.join('').length + (parts[0] ? 0.5 : 0) });
}
patterns.sort((a, b) => b.weight - a.weight);
// 零碎词：整句和句型都对不上时，至少把常见词换掉
const words = [...exact.entries()].filter(([zh]) => zh.length <= 6).sort((a, b) => b[0].length - a[0].length);

function single(s, depth) {
  if (exact.has(s)) return exact.get(s);
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    return p.tpl.replace(/\{(\d)\}/g, (_, k) => tr(m[Number(k) + 1] ?? '', depth + 1));
  }
  return null;
}

function core(s, depth) {
  const hit = single(s, depth);
  if (hit != null) return hit;
  // 用 " · " 拼起来的句子：拆开分别翻译；能整体对上的几段（比如"本学期 · 未同步"）合在一起翻
  if (!s.includes(' · ')) return null;
  const parts = s.split(' · ');
  const out = [];
  for (let i = 0; i < parts.length;) {
    let j = parts.length;
    for (; j > i + 1; j--) if (exact.has(parts.slice(i, j).join(' · '))) break;
    const seg = parts.slice(i, j).join(' · ');
    out.push(exact.get(seg) ?? tr(seg, depth + 1));
    i = j;
  }
  return out.join(' · ');
}

/** 翻译一段文字（中文模式原样返回） */
export function tr(s, depth = 0) {
  if (lang === 'zh' || s == null) return s;
  const str = String(s);
  if (!CJK.test(str) || depth > 4) return str;
  const lead = str.match(/^\s*/)[0];
  const trail = str.match(/\s*$/)[0];
  const body = str.trim();
  const hit = core(body, depth);
  if (hit != null) return lead + hit + trail;
  // 句尾的中文标点
  const punct = body.match(/^(.*?)([。！？；：，、]+)$/);
  if (punct) { const h = core(punct[1], depth); if (h != null) return lead + h + trail; }
  let out = body;
  for (const [zh, en] of words) if (out.includes(zh)) out = out.split(zh).join(en);
  out = out.replace(/，/g, ', ').replace(/。/g, '. ').replace(/：/g, ': ').replace(/（/g, ' (').replace(/）/g, ')').replace(/、/g, ', ');
  return lead + out + trail;
}

// ---------- 自动翻译页面 ----------
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);

function translateNode(n) {
  if (n.nodeType === 3) {
    if (n.parentNode && SKIP.has(n.parentNode.nodeName)) return;
    const v = n.nodeValue;
    if (v && CJK.test(v)) { const t = tr(v); if (t !== v) n.nodeValue = t; }
    return;
  }
  if (n.nodeType !== 1 || SKIP.has(n.nodeName) && n.nodeName !== 'INPUT' && n.nodeName !== 'TEXTAREA') return;
  if (n.closest && n.closest('[data-no-tr]')) return;
  for (const a of ATTRS) {
    const v = n.getAttribute && n.getAttribute(a);
    if (v && CJK.test(v)) { const t = tr(v); if (t !== v) n.setAttribute(a, t); }
  }
  if (n.nodeName === 'INPUT' || n.nodeName === 'TEXTAREA') return;
  for (const c of n.childNodes) translateNode(c);
}

let observer = null;
/** 翻译整页，并持续翻译之后新出现的内容 */
export function translatePage(root = document.body) {
  if (lang === 'zh') { observer?.disconnect(); observer = null; return; }
  translateNode(root);
  if (document.title && CJK.test(document.title)) document.title = tr(document.title);
  if (observer) return;
  observer = new MutationObserver((list) => {
    if (lang === 'zh') return;
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else for (const n of m.addedNodes) translateNode(n);
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
