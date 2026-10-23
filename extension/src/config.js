// 发给同学之前，把这里改成你服务器的地址（例如 'https://study.example.com'），
// 同学装好插件后登录页就会自动填好，不用每个人手动输入。
export const DEFAULT_SERVER = 'https://ddl.tommyxiaoshu.cn';

// 设置了服务器地址时，必须注册 / 登录、并且姓名和 Brightspace 一致才能用
export const REQUIRE_LOGIN = !!DEFAULT_SERVER;

export const VERSION_NOTES = [
  {
    v: '1.7.0',
    d: '2026-10-23',
    items: [
      '未来 7 天一览：一眼看出哪天作业扎堆，点某一天只看那天的',
      '遇到问题可以直接在插件里反馈（右上角 💬），回复也会显示在这里',
      '第一次使用有简单的引导',
      '有新动态时，插件图标上会出现紫色小圆点'
    ],
    en: [
      'Next 7 days at a glance: see which days are packed, and click a day to see just that day',
      'Send feedback right from the extension (💬 at the top right) — replies show up there too',
      'A short tour the first time you open it',
      'A purple dot on the toolbar icon when there are new updates'
    ]
  },
  {
    v: '1.6.5',
    d: '2026-10-23',
    items: [
      '自动同步更及时：默认每 10 分钟一次（可在设置里调整），打开插件、交完作业后也会马上同步',
      '更新更顺畅：有新版本时自动更新，开着的页面会在原位置重新打开',
      '可以手动切换浅色 / 深色外观',
      '修复：移除的课程同步后会重新出现'
    ],
    en: [
      'Fresher data: syncs every 10 minutes by default (adjustable in Settings), and right away when you open the extension or submit work',
      'Smoother updates: new versions install automatically, and open pages reopen where they were',
      'Switch between light and dark appearance',
      'Fixed: removed courses could reappear after a sync'
    ]
  },
  {
    v: '1.5.3',
    d: '2026-10-22',
    items: [
      '可以自己添加截止事项，比如 presentation、小组讨论，会一起显示和提醒',
      '主页右上角可以直接切换中文 / English'
    ],
    en: [
      'Add your own deadlines, such as presentations or group meetings — they show up and get reminders like everything else',
      'Switch between Chinese and English from the top bar'
    ]
  },
  {
    v: '1.4.1',
    d: '2026-10-22',
    items: ['支持中文和 English，界面、通知、手机网页和提醒邮件都会跟着切换'],
    en: ['Chinese and English: the interface, notifications, mobile web and reminder emails all follow your choice']
  },
  {
    v: '1.3.2',
    d: '2026-10-22',
    items: [
      '账号：注册时填写和 Brightspace 一致的姓名，核对通过后即可使用',
      '截止提醒邮件：截止前 24 小时和 3 小时提醒还没交的作业，电脑关机也会发',
      '手机 / iPad 网页版：随时查看截止时间和今日计划，可以添加到主屏幕'
    ],
    en: [
      'Accounts: sign up with your name as it appears on Brightspace; you\'re in once it\'s verified',
      'Reminder emails 24 hours and 3 hours before anything you haven\'t submitted — even when your computer is off',
      'Mobile / iPad web app for deadlines and your daily plan; add it to your home screen'
    ]
  },
  {
    v: '1.2.1',
    d: '2026-10-22',
    items: ['有新版本时一键更新，不用重新安装'],
    en: ['One-click updates — no reinstalling']
  },
  {
    v: '1.1.1',
    d: '2026-10-21',
    items: [
      '今日计划：每天告诉你先做哪几件事',
      '动态：公告、新课件、截止时间改动和出分，有变化会提醒你',
      '成绩：各门课已出分项目和最近出分一目了然'
    ],
    en: [
      'Today\'s plan: what to do first each day',
      'Updates: announcements, new files, due-date changes and grades, with alerts when something changes',
      'Grades: graded items and recent grades for every course at a glance'
    ]
  },
  {
    v: '1.0.0',
    d: '2026-10-21',
    items: [
      '所有课程的截止时间汇总在一起，能看出交没交，可以导出到日历',
      '课件库：按课程和章节整理课件，一键下载',
      '课程管理：移除不重要的课，或者把漏掉的课加回来'
    ],
    en: [
      'All your deadlines in one place, with submission status, and export to your calendar',
      'Course files organized by course and module, with one-click downloads',
      'Manage courses: remove ones you don\'t need or add back any that were missed'
    ]
  }
];
