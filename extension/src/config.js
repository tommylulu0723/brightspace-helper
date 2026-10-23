// 发给同学之前，把这里改成你服务器的地址（例如 'https://study.example.com'），
// 同学装好插件后登录页就会自动填好，不用每个人手动输入。
export const DEFAULT_SERVER = 'https://ddl.tommyxiaoshu.cn';

// 设置了服务器地址时，必须注册 / 登录、并且姓名和 Brightspace 一致才能用
export const REQUIRE_LOGIN = !!DEFAULT_SERVER;

export const VERSION_NOTES = [
  {
    v: '1.6.3',
    d: '2026-10-23',
    items: ['设置 → 更新日志 里加了"测试更新"按钮：模拟收到新版本，完整走一遍更新流程'],
    en: ['Added a "Test update" button in Settings → Changelog that simulates a new version and runs the full update flow']
  },
  {
    v: '1.6.2',
    d: '2026-10-23',
    items: [
      '更新更无感：没开着插件页面时直接在后台更新，只弹一条"已更新"通知',
      '开着汇总页时点"立即更新"，页面会在原来的位置自动重新打开，停在同一个页面，不用自己再找'
    ],
    en: [
      'Smoother updates: if no Course Helper page is open, updates install silently in the background with just an "Updated" notification',
      'If the dashboard is open, clicking "Update now" reopens it in the same place and view — no need to find it again'
    ]
  },
  {
    v: '1.6.1',
    d: '2026-10-23',
    items: [
      '修复：移除的课程同步后又出现。现在每个设置项单独记修改时间，同步时逐项合并，不会再被旧的设置覆盖',
      '外观可以手动选：主页右上角的按钮在 跟随系统 / 浅色 / 深色 之间切换（设置 → 语言 里也能选）'
    ],
    en: [
      'Fixed: removed courses coming back after a sync. Each setting now keeps its own timestamp and is merged field by field, so older settings can\'t overwrite newer ones',
      'Pick light or dark yourself: the button at the top right cycles System / Light / Dark (also in Settings → Language)'
    ]
  },
  {
    v: '1.6.0',
    d: '2026-10-23',
    items: [
      '随时同步：后台默认每 10 分钟同步一次（设置 → 通知 里可选 5 / 10 / 30 分钟）',
      '打开插件、切回汇总页、在 Brightspace 交完作业 / 做完测验、电脑从休眠回来时都会马上同步；交完作业半分钟左右就显示"已提交"'
    ],
    en: [
      'Always up to date: background sync every 10 minutes by default (choose 5 / 10 / 30 in Settings → Notifications)',
      'Also syncs right away when you open the extension, return to the dashboard, submit an assignment or quiz on Brightspace, or wake your computer — submissions show as "Submitted" within about half a minute'
    ]
  },
  {
    v: '1.5.3',
    d: '2026-10-22',
    items: ['修复：移除课程等确认框里，红色按钮上的字看不见'],
    en: ['Fixed: the text on red confirm buttons (e.g. Remove course) was invisible']
  },
  {
    v: '1.5.2',
    d: '2026-10-22',
    items: ['还没登录或没通过姓名核对时，有新版本直接自动更新（之前被登录页挡住看不到更新提示）'],
    en: ['While you\'re still on the login / name-check screen, new versions now install automatically (the update prompt used to be hidden there)']
  },
  {
    v: '1.5.1',
    d: '2026-10-22',
    items: [
      '修复：注册时名字填错会卡死。现在"姓名不一致"页面可以一键改成 Brightspace 上的姓名并马上重新核对',
      '用已经注册过的邮箱再注册：密码对就直接登录，不对就切到登录页并填好邮箱'
    ],
    en: [
      'Fixed: a typo in your name at sign-up could leave you stuck. The "name doesn\'t match" screen now lets you change it to your Brightspace name in one click and re-checks right away',
      'Signing up again with an existing email logs you in if the password is right, otherwise switches to Log in with the email filled in'
    ]
  },
  {
    v: '1.5.0',
    d: '2026-10-22',
    items: [
      '自己添加截止事项：截止时间页右上角"添加截止"，可以加 presentation、小组讨论、自己定的 deadline；会进今日计划、提醒、手机网页和提醒邮件；点标题可以编辑 / 删除',
      '主页右上角可以直接切换 中 / EN'
    ],
    en: [
      'Add your own deadlines: "Add deadline" on the Deadlines page — presentations, group meetings, personal deadlines. They appear in today\'s plan, alerts, the mobile web app and reminder emails; click the title to edit or delete',
      'Switch 中 / EN right from the top bar'
    ]
  },
  {
    v: '1.4.1',
    d: '2026-10-22',
    items: [
      '登录后直接进入插件：读取 Brightspace 和核对姓名在后台自动完成，顶部显示进度；没登录 Brightspace 时提示去登录，登录完自动继续',
      '只有姓名不一致或账号被别人绑定才会锁住；核对失败会显示原因，可以点"重试"'
    ],
    en: [
      'You go straight into the extension after logging in: reading Brightspace and the name check happen in the background, with progress shown at the top; if you\'re not logged in to Brightspace you\'re prompted, and it continues automatically afterwards',
      'Only a name mismatch or an account linked by someone else locks the extension; if the check fails you see why and can click "Retry"'
    ]
  },
  {
    v: '1.4.0',
    d: '2026-10-22',
    items: [
      '中英双语：设置 → 语言 里切换中文 / English，插件、通知、手机网页、提醒邮件都会跟着变',
      '安装程序第一步先选语言；安装完成后打开安装引导网页（修复之前只跳到 Chrome 首页的问题）'
    ],
    en: [
      'Chinese / English: switch in Settings → Language — the extension, notifications, mobile web and reminder emails all follow',
      'The installer asks for your language first, and opens a setup guide when it\'s done (fixes it opening only the Chrome home page)'
    ]
  },
  {
    v: '1.3.2',
    d: '2026-10-22',
    items: ['注册页更醒目地提示：姓名必须和 Brightspace 上完全一致'],
    en: ['The sign-up page now clearly warns that your name must match Brightspace exactly']
  },
  {
    v: '1.3.1',
    d: '2026-10-22',
    items: [
      '账号系统上线：服务器 ddl.tommyxiaoshu.cn。第一次打开需要注册（First / Last name 要和 Brightspace 一致），通过姓名校验后就能用',
      '登录后可以在 设置 → 账号 里开关截止提醒邮件，手机上打开 ddl.tommyxiaoshu.cn/m/ 查看'
    ],
    en: [
      'Accounts are live (server ddl.tommyxiaoshu.cn). Sign up the first time (first/last name must match Brightspace); you\'re in once the name check passes',
      'Turn deadline reminder emails on or off in Settings → Account; on your phone, open ddl.tommyxiaoshu.cn/m/'
    ]
  },
  {
    v: '1.3.0',
    d: '2026-10-22',
    items: [
      '账号系统（服务器上线后生效）：注册要填 First name / Last name，必须和 Brightspace 上的姓名一致才能使用；每个 Brightspace 账号只能绑定一个课程助手账号',
      '截止提醒邮件：截止前 24 小时和 3 小时，把还没交的作业 / 测验发到注册邮箱，电脑关机也照样发；设置 → 账号里可以开关、发测试邮件',
      '手机 / iPad 网页版：今日计划、截止时间、勾选完成、邮件提醒开关，可以"添加到主屏幕"像 App 一样用',
      'Windows 图形安装程序：可以选择安装位置，有进度条和完成页；Mac 安装也可以选位置'
    ],
    en: [
      'Accounts: sign up with your first/last name, which must match Brightspace; each Brightspace account can link to only one Course Helper account',
      'Deadline reminder emails 24 h and 3 h before anything you haven\'t submitted — even when your computer is off',
      'Mobile / iPad web app: daily plan, deadlines, tick items off, reminder settings; add it to your home screen',
      'Windows installer with a choice of install location; the Mac installer lets you pick a location too'
    ]
  },
  {
    v: '1.2.1',
    d: '2026-10-22',
    items: [
      '热更新更快：新版本推到 GitHub 后十几秒内就会弹"检测到更新"（以前最多 2 分钟）',
      '电脑每 15 秒拉取一次（重新运行一次一键安装生效），插件每 15 秒检查一次'
    ]
  },
  {
    v: '1.2.0',
    d: '2026-10-22',
    items: [
      '热更新：有新版本时弹出"检测到更新"（系统通知 + 插件里的绿色横幅，图标显示绿色 NEW），点"立即更新"几秒钟就换成新版本，不用重新装',
      '设置 → 通知 里可以打开"自动安装插件更新"，以后不问直接更新'
    ]
  },
  {
    v: '1.1.1',
    d: '2026-10-21',
    items: [
      '自动更新：配合 GitHub 仓库和电脑上的定时任务，有新版本时 1–2 分钟内自动重新加载，并弹通知告诉你更新了什么',
      'Windows 一键安装脚本：deploy/windows-setup.ps1（Mac 用 deploy/mac-setup.sh）'
    ]
  },
  {
    v: '1.1.0',
    d: '2026-10-21',
    items: [
      '今日计划：截止时间页最上面列出今天先做的几件事（截止前 3 天开始出现，考试提前 7 天，考试 > 作业 > 讨论），每天早上发一条通知',
      '动态：各门课的公告汇总，加上新课件、课件更新、截止时间改动、新作业、出分，每次同步自动对比并提醒；图标上的紫色数字是未读动态',
      '成绩：每门课的得分率 / 期末成绩（老师公布后），最近出分列表，点课程看全部成绩',
      '设置 → 通知 里可以分别开关三种提醒；设置 → 更新日志 里有"重新加载插件"，配合 GitHub 更新用'
    ]
  },
  {
    v: '1.0.0',
    d: '2026-10-21',
    items: [
      '正式版：去掉 AI 助手，专注截止时间和课件库，插件更轻、权限更少（只访问 brightspace.nyu.edu）',
      '升级时会自动清掉旧版本留在本机的 API key 和 AI 对话记录',
      '设置页调整顺序：课程管理放在最前面，账号改为可选'
    ]
  },
  {
    v: '0.3.1',
    d: '2026-10-21',
    items: [
      'AI 助手支持 DeepSeek：设置 → AI 设置 里可以选 Claude 或 DeepSeek，可以和情侣空间共用同一个 DeepSeek key',
      'DeepSeek 支持"深度思考"，回答里可以展开看思考过程',
      'PDF 会在本机提取文字（支持中文 PDF），扫描件 / 纯图片页会提示读不到字',
      '修复导出对话、导出日历、修改密码、粘贴文字这几个弹窗打不开的问题'
    ]
  },
  {
    v: '0.3.0',
    d: '2026-10-21',
    items: [
      '课程管理：可以移除不重要的课，也可以把没自动识别的课加回来',
      '账号：注册 / 登录后，"标记完成"和课程设置会云同步，手机上也能看截止时间',
      'AI 课程助手（内测）：每门课一个对话，可以选课件、上传 PDF / PPT / 录音，让 AI 总结重点'
    ]
  },
  { v: '0.2.0', d: '2026-10-21', items: ['修正做过的测验显示"逾期"的问题', '新增课件库', '界面重做，支持深色模式'] },
  { v: '0.1.0', d: '2026-10-21', items: ['Deadline 汇总、后台同步、通知、导出日历'] }
];
