'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import {
  buildPaletteCss,
  contrastRatioOfHex,
  deriveLightTokens,
  deriveNightTokens,
  hexToHsl,
  hslToHex,
  readableOn,
  type Hsl,
} from '@/lib/theme/palette-core'
import { cn } from '@/lib/utils'

/** 运行时覆盖层样式元素的 id。构建期注入的那段 `<head>` 样式不带 id，互不干扰。 */
const OVERRIDE_STYLE_ID = 'playbook-palette-override'

/** 五个槽位。语义与 `config/palette.ts` 的注释严格一致，不在这里发明新语义。 */
const SLOTS = [
  { label: '主强调', hint: '主按钮、粉色块、外壳底色' },
  { label: '次强调', hint: '薄荷、奶油浅底，画布与卡片表面都从它提亮' },
  { label: '第三强调', hint: '天空色、焦点环' },
  { label: '深中性 1', hint: '预留槽位，对齐五色色卡结构' },
  { label: '深中性 2', hint: '正文、次要文字、边框、阴影都由它压暗' },
] as const

/** 派生色板预览用的 token 顺序（与实际页面上的使用位置对应）。 */
const TOKEN_PREVIEW = [
  '--canvas',
  '--surface',
  '--soft',
  '--shell',
  '--ink',
  '--muted',
  '--coral',
  '--pink',
  '--cream',
  '--mint',
  '--sky',
  '--lilac',
] as const

export type PaletteLabPreset = {
  id: string
  name: string
  /** 5 个十六进制色值，顺序与槽位一致。 */
  colors: readonly string[]
}

type PaletteLabProps = {
  /** 构建期生效的 5 色。作为 SSR 初始值，保证首屏与静态产物完全一致。 */
  initialColors: readonly string[]
  presets: readonly PaletteLabPreset[]
}

function toHslList(colors: readonly string[]): Hsl[] {
  return colors.map(hexToHsl)
}

/**
 * 首页 hero 的配色实验室（决策 D-23）。
 *
 * ## 为什么初始值来自 props 而不是自己读 DOM
 *
 * 配色是构建期常量，根布局把派生好的 CSS 注入 `<head>`。组件若在首帧自己去读
 * `getComputedStyle` 决定初始色，服务端渲染的结果与客户端首帧必然对不上，
 * 触发 hydration mismatch 并让整个 hero 重渲染。这里由服务端把
 * `resolvePaletteColors()` 的结果作为 prop 传下来，首帧两端完全一致。
 *
 * ## 为什么改动不持久化
 *
 * 只作用于当前页面。刷新即回到站点默认配色。理由：
 *
 * - 持久化需要客户端在挂载后读取并套用，会先闪一帧默认配色再跳到自定义配色 —
 *   首页整页颜色闪一次，代价太高。
 * - 配色属于站点身份（D-22），构建期才是真值。实验室是「试一试」，
 *   真要用某个配色，做法是把它填进 `config/palette.ts` 的 `customColors`。
 *   界面上写明了这一点，避免用户以为拖完滑块就永久生效。
 *
 * ## 为什么用 `<style>` 而不是给 `<html>` 写 inline style
 *
 * 派生结果同时包含 `:root`（日间）与 `:root[data-theme='night']`（夜间）两套
 * 选择器。inline style 只能表达单个元素的一组属性，会把夜间那套整段压掉。
 */
export function PaletteLab({ initialColors, presets }: PaletteLabProps) {
  // 【单一数据源】只存 HSL。颜色一律由 HSL 派生。
  //
  // 为什么不是「同时存 colors 与 hsls 两套状态」：早先的实现就是两份，
  // 拖滑块时在 setHsls 的 updater 里又调 setSlotColor，导致同一个事件里
  // 触发两个 setState、两路数据互相覆盖 —— 实测表现是「拖了没反应」与
  // 「连续拖只出一个值」。两份可能不一致的状态在这里就是 bug 的源头。
  //
  // 为什么不直接存 hex：饱和度拖到 0 时色相在数学上无定义，从 hex 反推会丢色相，
  // 把饱和度拖回来就会跳成红色。存 HSL 才能让三个滑块各自独立可逆。
  const [hsls, setHsls] = useState<Hsl[]>(() => toHslList(initialColors))
  const [selected, setSelected] = useState(0)
  const baseId = useId()

  const colors = useMemo(() => hsls.map(hslToHex), [hsls])
  const initialHexes = useMemo(() => initialColors.map((c) => c.toLowerCase()), [initialColors])
  const isDirty = colors.some((color, index) => color !== initialHexes[index])

  // 把当前 5 色派生出的整套 CSS 写进一个独立的 <style>，位置在构建期样式之后，
  // 因此后写者胜出。未改动时移除该元素，页面完全回到静态产物状态。
  useEffect(() => {
    const existing = document.getElementById(OVERRIDE_STYLE_ID)
    if (!isDirty) {
      existing?.remove()
      return
    }

    let target = existing
    if (!target) {
      target = document.createElement('style')
      target.id = OVERRIDE_STYLE_ID
      document.head.appendChild(target)
    }
    target.textContent = buildPaletteCss(colors)
  }, [colors, isDirty])

  const tokens = useMemo(() => deriveLightTokens(colors), [colors])

  // 实时可读性反馈。全部用派生层的真实产出算，不是另写一套阈值。
  const readouts = useMemo(() => {
    const ink = contrastRatioOfHex(tokens['--ink'], tokens['--canvas'])
    const muted = contrastRatioOfHex(tokens['--muted'], tokens['--canvas'])
    const onAccent = tokens['--on-accent']
    const caps = ['--coral', '--pink', '--cream', '--mint', '--sky', '--lilac']
    const minCap = Math.min(...caps.map((cap) => contrastRatioOfHex(onAccent, tokens[cap])))
    const focus = contrastRatioOfHex(tokens['--focus'], tokens['--canvas'])

    return [
      { label: '正文 / 画布', value: ink, target: 7, unit: 'AAA 7:1' },
      { label: '次要文字 / 画布', value: muted, target: 4.5, unit: 'AA 4.5:1' },
      { label: '按钮文字 / 最浅按钮面', value: minCap, target: 4.5, unit: 'AA 4.5:1' },
      { label: '焦点环 / 画布', value: focus, target: 3, unit: '非文本 3:1' },
    ]
  }, [tokens])

  // 夜间正文能否达到 7:1 —— 以及「最深位」是不是已经被拉亮到做不到。
  //
  // 为什么需要这条：p5 被拉亮后，夜间画布即使被钉到亮度上限 0.16，
  // 浅色正文在它上面也只能到 5:1 左右（实测 5.04~5.12）。这是数学事实，
  // 不是代码 bug：7:1 要求底色相对亮度 ≤ 0.045。所以界面必须诚实地报出来，
  // 而不是默默降级或把错误藏起来。
  const nightTokens = useMemo(() => deriveNightTokens(colors), [colors])
  const nightInkRatio = contrastRatioOfHex(nightTokens['--ink'], nightTokens['--canvas'])
  const p5TooLight = nightInkRatio < 7

  // 只有这一个写入口：改 HSL，hex 自动跟随。
  const handleSlider = useCallback((index: number, key: keyof Hsl, raw: number) => {
    setHsls((prev) => prev.map((hsl, i) => (i === index ? { ...hsl, [key]: raw } : hsl)))
  }, [])

  const applyPreset = useCallback((preset: PaletteLabPreset) => {
    setHsls(toHslList(preset.colors))
  }, [])

  const reset = useCallback(() => {
    setHsls(toHslList(initialColors))
  }, [initialColors])

  const active = SLOTS[selected]
  const activeHsl = hsls[selected]

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="relative overflow-hidden rounded-[34px] p-5 sm:p-7"
      style={{ background: 'var(--shell)' }}
    >
      <div
        className="rounded-[24px] p-5 sm:p-6"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              id={`${baseId}-title`}
              className="flex items-center gap-2 font-display text-xl"
              style={{ color: 'var(--ink)' }}
            >
              <Icon name="auto_awesome" size={17} />
              配色实验室
            </h2>
            <p className="mt-1.5 max-w-[430px] text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              5 个颜色决定整站。点一个色块，再用 HSL 三个滑块拧它，全站立刻跟着变。
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-extrabold"
            style={{ background: 'var(--soft)', color: 'var(--muted)' }}
          >
            {isDirty ? '试验中 · 刷新即还原' : '站点默认配色'}
          </span>
        </div>

        {/* ---- 5 个色槽 ---- */}
        <div role="group" aria-label="选择要调整的主题色" className="mt-5 grid grid-cols-5 gap-2">
          {colors.map((color, index) => {
            const isSelected = index === selected
            // 标签写在用户选的颜色上。第 4、5 个槽位通常是深中性色，
            // 固定用 --on-accent 会变成「深字压深底」——目视发现的真实缺陷。
            // 这里从现有 token 里挑可读的那个，不引入新颜色。
            const labelOnSlot = readableOn(color, [tokens['--on-accent'], tokens['--canvas']])
            return (
              <button
                key={SLOTS[index].label}
                type="button"
                onClick={() => setSelected(index)}
                aria-pressed={isSelected}
                aria-label={`${SLOTS[index].label}，当前 ${color}`}
                className={cn(
                  'relative flex min-h-[58px] flex-col justify-end rounded-[14px] border-2 p-2 text-left transition-transform',
                  isSelected ? 'scale-[1.03]' : 'hover:-translate-y-[2px]',
                )}
                style={{
                  background: color,
                  borderColor: isSelected ? 'var(--ink)' : 'var(--line)',
                  boxShadow: isSelected ? '0 4px 0 var(--line)' : 'none',
                }}
              >
                <span
                  className="text-[10px] font-extrabold leading-tight"
                  style={{ color: labelOnSlot }}
                >
                  {SLOTS[index].label}
                </span>
                <span className="text-[10px] font-bold leading-tight" style={{ color: labelOnSlot }}>
                  {color.toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          第 {selected + 1} 位 · {active.label}：{active.hint}
        </p>

        {/* 槽位约束警告（D-23）。
            「最深色」被拉亮后，夜间正文的 7:1 在数学上做不到（实测 5.04~5.12）。
            派生层已经把画布钉到上限、并让 ink 自动选方向，但不可能无限偏就。
            与其假装没问题，不如直接告诉用户。 */}
        {p5TooLight ? (
          <p
            role="status"
            className="mt-2 rounded-[12px] px-3 py-2 text-xs font-bold leading-relaxed"
            style={{ background: 'var(--cream)', color: 'var(--on-accent)' }}
          >
            最深那位变亮了：夜间正文只能到 {nightInkRatio.toFixed(1)}:1（目标 7:1）。
            想恢复 AAA，把第 5 位调回去。
          </p>
        ) : null}

        {/* ---- HSL 三个滑块 ---- */}
        <div className="mt-4 grid gap-3">
          {(
            [
              { key: 'h' as const, label: '色相 H', min: 0, max: 360, suffix: '°' },
              { key: 's' as const, label: '饱和度 S', min: 0, max: 100, suffix: '%' },
              { key: 'l' as const, label: '亮度 L', min: 0, max: 100, suffix: '%' },
            ]
          ).map((slider) => {
            const value = Math.round(activeHsl[slider.key])
            const inputId = `${baseId}-${slider.key}`
            return (
              <div key={slider.key} className="grid grid-cols-[86px_1fr_52px] items-center gap-3">
                <label htmlFor={inputId} className="text-xs font-extrabold" style={{ color: 'var(--ink)' }}>
                  {slider.label}
                </label>
                <input
                  id={inputId}
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={1}
                  value={value}
                  aria-valuetext={`${value}${slider.suffix}`}
                  onChange={(event) => handleSlider(selected, slider.key, Number(event.target.value))}
                  className="palette-lab__range w-full"
                  style={{ accentColor: colors[selected] }}
                />
                <output
                  htmlFor={inputId}
                  className="text-right text-xs font-bold tabular-nums"
                  style={{ color: 'var(--muted)' }}
                >
                  {value}
                  {slider.suffix}
                </output>
              </div>
            )
          })}
        </div>

        {/* ---- 派生结果：让「所有元素都遵循这 5 色」看得见 ---- */}
        <div className="mt-5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
            派生出的语义色
          </p>
          <div aria-hidden="true" className="mt-2 flex flex-wrap gap-1.5">
            {TOKEN_PREVIEW.map((token) => (
              <span
                key={token}
                title={`${token} ${tokens[token]}`}
                className="h-6 w-6 rounded-[7px] border"
                style={{ background: `var(${token})`, borderColor: 'var(--line)' }}
              />
            ))}
          </div>
        </div>

        {/* ---- 实时对比度 ---- */}
        <dl className="mt-4 grid grid-cols-2 gap-2" aria-label="实时对比度">
          {readouts.map((item) => {
            const pass = item.value >= item.target
            return (
              <div
                key={item.label}
                className="rounded-[12px] px-2.5 py-2"
                style={{ background: 'var(--soft)' }}
              >
                <dt className="text-[10px] font-bold leading-tight" style={{ color: 'var(--muted)' }}>
                  {item.label}
                </dt>
                <dd className="mt-0.5 flex items-baseline gap-1.5">
                  <span
                    className="text-sm font-black tabular-nums"
                    style={{ color: pass ? 'var(--ink)' : 'var(--coral-base)' }}
                  >
                    {item.value.toFixed(2)}
                  </span>
                  <span
                    className="text-[10px] font-extrabold"
                    style={{ color: pass ? 'var(--muted)' : 'var(--coral-base)' }}
                  >
                    {pass ? '达标' : '偏低'} · {item.unit}
                  </span>
                </dd>
              </div>
            )
          })}
        </dl>

        {/* ---- 预设与还原 ---- */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="min-h-[34px] rounded-full border-2 px-3 text-xs font-extrabold"
              style={{ background: 'var(--soft)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              {preset.name}
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            disabled={!isDirty}
            className="ml-auto flex min-h-[34px] items-center gap-1.5 rounded-full border-2 px-3 text-xs font-extrabold disabled:opacity-45"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
          >
            <Icon name="arrow_back" size={13} />
            还原默认
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
          这只是一次试色，刷新页面就回到站点配色。真要用这套颜色，把 5 个值填进
          <code className="mx-1 font-bold">config/palette.ts</code>
          的 <code className="font-bold">customColors</code>。
        </p>
      </div>
    </section>
  )
}
