import { Icon } from '@/components/ui/icon'
import { siteConfig } from '@/config/site'

export const metadata = {
  title: '关于',
  description: '关于作者、关注方向与联系方式。',
}

/**
 * 关于页骨架（设计 06 / Phase 3）。
 * 正文后续来自 content/pages/about.mdx，身份与链接统一取自 config/site.ts。
 */
export default function AboutPage() {
  return (
    <>
      <section className="grid gap-8 pt-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          aria-hidden="true"
          className="grid h-[150px] w-[150px] place-items-center rounded-[38px] text-[64px]"
          style={{
            background: 'var(--shell)',
            boxShadow: 'var(--shadow)',
            transform: 'rotate(-3deg)',
          }}
        >
          <Icon name="sentiment_satisfied" size={64} />
        </div>
        <div>
          <h1 className="font-display text-[clamp(32px,5vw,46px)] leading-tight">
            你好，我是 {siteConfig.author}。
          </h1>
          <p className="mt-3 max-w-[620px] text-base leading-relaxed text-[var(--muted)]">
            {siteConfig.bio}
          </p>
        </div>
      </section>

      <section className="mt-10 max-w-[720px]" aria-labelledby="doing-title">
        <h2 id="doing-title" className="font-display text-2xl">
          我在做什么
        </h2>
        <p className="mt-3 text-base leading-relaxed text-[var(--muted)]">
          {siteConfig.name} 是我的个人内容站，也是一套持续演进的玩具。文章承载成段的思考，
          时间轴收藏碎片时刻，统计记录这个小生命的体征。
        </p>
        <p className="mt-3 text-xs font-bold text-[var(--muted)]">
          正文内容将在后续版本从 content/pages/about.mdx 载入。
        </p>
      </section>
    </>
  )
}
