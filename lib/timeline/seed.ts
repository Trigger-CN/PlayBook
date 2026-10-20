import type { TimelineItem } from '@/lib/timeline/types'

/**
 * 本地种子数据（路线图 Phase 4：先用 seed 跑通页面）。
 * 接入 Supabase 后由 lib/timeline/repository.ts 换成真实查询，页面层不变。
 */
export const timelineSeed: TimelineItem[] = [
  {
    id: 'site-v0-1-launch',
    title: '站点 v0.1 上线',
    type: 'release',
    status: 'published',
    occurredAt: '2026-07-17',
    content:
      '脚手架、主题 token 与文章管线终于跑通，第一次把自己的站点推到线上。\n\n按钮按下去那一下有实体的手感，是这一版最满意的部分；剩下的页面会沿着同一条语言慢慢长出来。',
    imageUrl: '/images/timeline/site-launch.svg',
    imageAlt: '浏览器窗口里排着标题与按钮的插画',
    externalUrl: 'https://nextjs.org/blog',
  },
  {
    id: 'desk-reset-2026',
    title: '重新整理工作台',
    type: 'note',
    status: 'published',
    occurredAt: '2026-07-11',
    content:
      '把显示器抬高了一点，键盘换成更矮的那把，桌面只留一杯水和一本正在读的书。整理桌面其实是在整理注意力。',
    imageUrl: '/images/timeline/desk-setup.svg',
    imageAlt: '窗边工作台与显示器、绿植的插画',
  },
  {
    id: 'theme-button-spec',
    title: '定下按钮的立体规范',
    type: 'project',
    status: 'published',
    occurredAt: '2026-06-28',
    content:
      '把按钮的厚度、圆角和按压位移写成固定数值，hover 抬高 3px，按下只留 2px 底座。数值定下来之后，所有页面忽然像同一个盒子里的玩具。',
  },
  {
    id: 'designing-design-reading',
    title: '读完《设计中的设计》',
    type: 'reading',
    status: 'published',
    occurredAt: '2026-06-05',
    content:
      '原研哉讲的不只是设计，更像是在讲怎么重新看日常。合上书之后我盯着地铁里的导视牌看了很久。',
  },
  {
    id: 'note-100',
    title: '第 100 篇笔记',
    type: 'milestone',
    status: 'published',
    occurredAt: '2026-05-19',
    content:
      '从第一篇到现在，断断续续写了两年多。大部分笔记都很短，但它们连起来就是我这两年在想什么。',
  },
  {
    id: 'hangzhou-rain',
    title: '杭州，雨后的西湖',
    type: 'travel',
    status: 'published',
    occurredAt: '2026-04-02',
    content:
      '雨停了才出门，湖面还有一层薄雾。走了整整一圈，中途在一棵柳树下坐了很久，什么也没做。',
    imageUrl: '/images/timeline/hangzhou-lake.svg',
    imageAlt: '雨后湖面与柳树的插画',
  },
  {
    id: 'font-switch',
    title: '把字体换回系统栈',
    type: 'note',
    status: 'published',
    occurredAt: '2026-03-14',
    content:
      '为了少加载一份字库，正文换回系统字体。第一眼有点陌生，读了两天之后发现中文标点终于对上了。',
  },
  {
    id: 'palette-v1',
    title: '数字玩具盒配色第一版',
    type: 'project',
    status: 'archived',
    occurredAt: '2026-02-21',
    content:
      '第一版配色偏灰，被自己否掉了。保留在这里当作一次记录：明亮的面加上深色的底，才是这套语言成立的原因。',
  },
  {
    id: 'plans-2026',
    title: '今年想做的事',
    type: 'note',
    status: 'draft',
    occurredAt: '2026-01-09',
    content: '还没想清楚，先列几条放在草稿里：把站点写完、把相机用熟、少熬夜。',
  },
  {
    id: 'first-shipped-product',
    title: '第一次把想法做成线上产品',
    type: 'milestone',
    status: 'published',
    occurredAt: '2025-12-24',
    content:
      '从画草图到上线用了三个月，用户不多，但真的有人在用。那天晚上把反馈邮件读了三遍。',
  },
  {
    id: 'kyoto-seven-days',
    title: '京都，一个人走了七天',
    type: 'travel',
    status: 'published',
    occurredAt: '2025-10-08',
    content:
      '没有排行程，每天出门随便走。早上在鸭川边看人遛狗，下午钻进旧书店，晚上回住处写字。\n\n七天里说得最少，想得最多。',
    imageUrl: '/images/timeline/kyoto-torii.svg',
    imageAlt: '山间红色鸟居的插画',
  },
  {
    id: 'first-oss-component',
    title: '发布第一个开源组件',
    type: 'release',
    status: 'published',
    occurredAt: '2025-08-30',
    content:
      '一个很小的按钮组件，被人提了第一个 issue。第一次体会到维护别人依赖的东西是什么感觉。',
    externalUrl: 'https://github.com',
  },
  {
    id: 'code-complete-reread',
    title: '重读《代码大全》',
    type: 'reading',
    status: 'published',
    occurredAt: '2025-06-12',
    content:
      '学生时代读它是为了面试，现在读它是为了少写一点自己将来要维护的代码。同一本书，两次读到的重点完全不同。',
  },
  {
    id: 'start-long-writing',
    title: '决定开始长期写作',
    type: 'note',
    status: 'published',
    occurredAt: '2025-03-02',
    content:
      '不是为了输出观点，只是想让脑子里的东西有个地方落下来。写下来之后，很多想法才第一次变得完整。',
  },
  {
    id: 'first-personal-site',
    title: '用 Next.js 搭的第一个个人站',
    type: 'project',
    status: 'published',
    occurredAt: '2024-11-11',
    content:
      '照着教程一步步搭起来，样式全靠复制粘贴。现在回头看很粗糙，但它是我所有项目的起点。',
  },
  {
    id: 'moved-house',
    title: '搬进新租的房子',
    type: 'note',
    status: 'published',
    occurredAt: '2024-09-01',
    content: '窗朝东，早上会被光叫醒。书桌放在窗边之后，早上写东西变得容易了很多。',
  },
]
