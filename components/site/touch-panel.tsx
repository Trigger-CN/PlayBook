'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

import { Icon } from '@/components/ui/icon'
import { ToyButton } from '@/components/ui/toy-button'
import { readThemeFromDom, subscribeTheme, writeTheme } from '@/lib/theme-dom'
import type { Theme } from '@/lib/theme-shared'

/* ==============================================================
 * 档位吸附的物理模型（决策 D-24）
 *
 * 需求是「拨动他要花一些力气」「有档位弹性吸附」。原生 <input type="range">
 * 做不到：它的拇指永远精确跟随指针，且会在 step 边界瞬间跳过去 —— 摸起来是
 * 滑的，不是「卡进去」的。
 *
 * 所以自己算：把连续的档位坐标 `raw`（0..n-1）揉成视觉坐标。
 *
 *   applyDetent(raw):
 *     距最近档心 d ∈ [-0.5, 0.5]，
 *     |d| <= DEAD_ZONE  → 返回档心本身（死区，拇指纹丝不动）
 *     |d| >  DEAD_ZONE  → 剩余行程按幂曲线压缩后再走
 *
 * 两个参数各自负责一件事：
 *
 *   DEAD_ZONE = 0.3  —— 决定「力气」。档心附近 30% 的行程被吃掉，
 *                        指针动而拇指不动，用户必须拖过这段才换档。
 *   DETENT_CURVE = 2.4 —— 决定「弹性」。幂次越小越接近线性（柔），
 *                        越大则越晚才屈服、屈服后越猛（脆而带弹）。
 *
 * 关键性质：|d| = 0.5 时返回值恰为最近的 ±0.5，即两档的正中点。
 * 而跨过 0.5 时 Math.round 换档，视觉坐标从「上一档 +0.5」变成「下一档 -0.5」，
 * 两点数值相同 —— **跨档处连续，不会跳一格**。
 * 这一条是这套手感能不能用的分界：写错就会在换档瞬间闪一下。
 * ============================================================== */
const DETENT_DEAD_ZONE = 0.3
const DETENT_CURVE = 2.4

function applyDetent(raw: number): number {
  const nearest = Math.round(raw)
  const d = raw - nearest
  const ad = Math.abs(d)
  if (ad <= DETENT_DEAD_ZONE) return nearest
  const t = (ad - DETENT_DEAD_ZONE) / (0.5 - DETENT_DEAD_ZONE)
  return nearest + Math.sign(d) * Math.pow(t, DETENT_CURVE) * 0.5
}

const clampIndex = (index: number, detents: number) =>
  index < 0 ? 0 : index > detents - 1 ? detents - 1 : index

/* ---------------- 颗粒度档位与旋钮档数 ---------------- */

const GRANULARITY_LEVELS = [1, 2, 3, 4, 5] as const
export type GranularityLevel = (typeof GRANULARITY_LEVELS)[number]

/** 颗粒度 1..5 → 旋钮的吸附档数。档数越多，转动时卡得越细。 */
const KNOB_DETENTS: Record<GranularityLevel, number> = { 1: 4, 2: 8, 3: 12, 4: 20, 5: 36 }
const KNOB_SWEEP_DEG = 270
const KNOB_HALF_DEG = KNOB_SWEEP_DEG / 2

/* ==============================================================
 * 竖直档位滑块的几何
 * 容器高度固定，拇指中心在容器内缘起止，所以行程 = 高度 - 2 * 内边距。
 * ============================================================== */
const SLIDER_HEIGHT = 172
const SLIDER_INSET = 16

/**
 * 竖直档位滑块。
 *
 * 为什么用 role="slider" 而不是原生 <input type="range">：原生 range 的拇指
 * 由浏览器绘制，无法呈现「指针在动、拇指不动」的磁滞手感；而 `step` 又会在
 * 边界瞬间跳变。自定义控件负责绘制，但**键盘与 ARIA 必须自己补全**：
 * ↑/→ +1、↓/← -1、Home/End 到两端、PageUp/PageDown 跨两档。
 *
 * 受控：外部 `value` 是唯一真值，内部只保留拖动中的连续坐标 `raw`。
 * 这样页头的主题开关一动，主题滑块的拇指也会跟着动。
 */
function DetentSlider({
  detents,
  value,
  onChange,
  label,
  valueText,
  topBadge,
  bottomBadge,
  hint,
}: {
  detents: number
  value: number
  onChange: (index: number) => void
  label: string
  valueText: (index: number) => string
  topBadge: ReactNode
  bottomBadge: ReactNode
  hint: string
}) {
  const id = useId()
  const trackRef = useRef<HTMLDivElement>(null)
  const [raw, setRaw] = useState(value)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  // 外部真值变化（例如页头切了主题）→ 同步拇指位置。
  // 拖动中不同步，否则会把用户正拖着的坐标打回去。
  useEffect(() => {
    if (!draggingRef.current) setRaw(value)
  }, [value])

  const commit = useCallback(
    (nextRaw: number) => {
      setRaw(nextRaw)
      const index = clampIndex(Math.round(nextRaw), detents)
      if (index !== value) onChange(index)
    },
    [detents, onChange, value],
  )

  const rawFromPointer = useCallback((clientY: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const travel = rect.height - SLIDER_INSET * 2
    if (travel <= 0) return 0
    // 顶部 = 最大值，所以取反向。
    const p = (rect.bottom - SLIDER_INSET - clientY) / travel
    // 注意这里是「把比例夹到 0..1」，不是「把档位索引夹到合法范围」。
    // 曾经误写成 clampIndex(p, 1)：clampIndex 的第二个参数是**档数**，
    // 上限为 detents-1，传 1 就变成上限 0，于是 p 无论多少都被夹成 0 ——
    // 表现就是「按哪里都是最低档」，且连带把主题滑块一起锁死。
    const t = p < 0 ? 0 : p > 1 ? 1 : p
    return t * (detents - 1)
  }, [detents])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = true
      setDragging(true)
      commit(rawFromPointer(event.clientY))
    },
    [commit, rawFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      commit(rawFromPointer(event.clientY))
    },
    [commit, rawFromPointer],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      // 松手后落回最近档心 —— 这就是「吸附」那一下。
      setRaw(Math.round(raw))
    },
    [raw],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const DELTA: Record<string, number> = {
        ArrowUp: 1,
        ArrowRight: 1,
        ArrowDown: -1,
        ArrowLeft: -1,
        PageUp: 2,
        PageDown: -2,
      }
      if (event.key === 'Home') {
        event.preventDefault()
        onChange(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        onChange(detents - 1)
        return
      }
      const delta = DELTA[event.key]
      if (delta === undefined) return
      event.preventDefault()
      // 键盘是离散的：从**当前已确认档位**走一格，不掺入连续坐标。
      onChange(clampIndex(value + delta, detents))
    },
    [detents, onChange, value],
  )

  const visual = applyDetent(raw)
  const frac = detents > 1 ? visual / (detents - 1) : 1
  const thumbTop = `calc(${SLIDER_INSET}px + (100% - ${SLIDER_INSET * 2}px) * ${1 - frac})`

  const detentMarks = useMemo(
    () => Array.from({ length: detents }, (_, i) => i),
    [detents],
  )

  return (
    <div className="flex flex-col items-center gap-2">
      <span aria-hidden="true" className="text-[10px] font-extrabold" style={{ color: 'var(--muted)' }}>
        {topBadge}
      </span>

      <div
        id={id}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={detents - 1}
        aria-valuenow={value}
        aria-valuetext={valueText(value)}
        aria-describedby={`${id}-hint`}
        data-detents={detents}
        data-value={value}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative w-[62px] cursor-grab touch-none select-none rounded-[18px] active:cursor-grabbing"
        style={{ height: SLIDER_HEIGHT, background: 'var(--soft)', border: '2px solid var(--line)' }}
      >
        {/* 轨道：拇指可在其中滑动的那条槽 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 w-[10px] -translate-x-1/2 rounded-full"
          style={{
            top: SLIDER_INSET,
            bottom: SLIDER_INSET,
            background: 'var(--line)',
            // 内阴影用 --ink（由最深源色派生）而不是写死 rgba(0,0,0,…)。
            // D-21 已经踩过同类坑：硬编码的黑色在自定义配色下会在轨道上
            // 留一块不相干的深色。组件里不出现色值（D-22）。
            boxShadow: 'inset 0 2px 0 var(--ink)',
          }}
        />
        {/* 档位刻痕：让「有几个档」看得见，而不是只能靠手感猜 */}
        {detentMarks.map((mark) => {
          const markFrac = detents > 1 ? mark / (detents - 1) : 1
          return (
            <span
              key={mark}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 h-[2px] w-[26px] -translate-x-1/2 rounded-full"
              style={{
                top: `calc(${SLIDER_INSET}px + (100% - ${SLIDER_INSET * 2}px) * ${1 - markFrac} - 1px)`,
                background: 'var(--line)',
                opacity: mark === value ? 0.25 : 0.5,
              }}
            />
          )
        })}
        {/* 拇指。拖动中关掉 transition：磁滞手感本身就是位移曲线，
            再叠一层补间等于双重延迟，会发黏。松手才开 transition 落回档心。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 grid h-[32px] w-[46px] place-items-center rounded-[10px]"
          style={{
            top: thumbTop,
            transform: 'translate(-50%, -50%)',
            background: 'var(--cream)',
            border: '2px solid var(--ink)',
            boxShadow: '0 4px 0 var(--coral-base)',
            transition: dragging ? 'none' : 'top 220ms cubic-bezier(0.22, 1.4, 0.4, 1)',
          }}
        >
          <span className="h-[2px] w-[18px] rounded-full" style={{ background: 'var(--ink)', opacity: 0.55 }} />
        </span>
      </div>

      <span aria-hidden="true" className="text-[10px] font-extrabold" style={{ color: 'var(--muted)' }}>
        {bottomBadge}
      </span>
      <span id={`${id}-hint`} className="visually-hidden">
        {hint}
      </span>
    </div>
  )
}

/**
 * 带档位旋转的旋钮。
 *
 * 角度 → 连续档位坐标 → applyDetent 揉成视觉角度，与滑块共用同一套手感模型。
 * 拖动时按指针相对圆心的极角计算（0° 朝上，顺时针为正），限制在 ±135°。
 *
 * 颗粒度变化时**保持角度、改变档数**：所以内部存的是归一化的 `frac`（0..1），
 * 而不是档位索引。否则改颗粒度会把旋钮的物理位置一起打乱。
 */
function DetentKnob({
  detents,
  label,
  readout,
}: {
  detents: number
  label: string
  readout: string
}) {
  const id = useId()
  const knobRef = useRef<HTMLDivElement>(null)
  const [frac, setFrac] = useState(0.52)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  const index = clampIndex(Math.round(frac * (detents - 1)), detents)

  const fracFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = knobRef.current
    if (!el) return frac
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // atan2(dx, -dy)：0° 指向正上方，顺时针为正。
    const deg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI
    const clampedDeg = deg < -KNOB_HALF_DEG ? -KNOB_HALF_DEG : deg > KNOB_HALF_DEG ? KNOB_HALF_DEG : deg
    return (clampedDeg + KNOB_HALF_DEG) / KNOB_SWEEP_DEG
  }, [frac])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = true
      setDragging(true)
      setFrac(fracFromPointer(event.clientX, event.clientY))
    },
    [fracFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      setFrac(fracFromPointer(event.clientX, event.clientY))
    },
    [fracFromPointer],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      // 落回最近档心。
      const snapped = clampIndex(Math.round(frac * (detents - 1)), detents)
      setFrac(detents > 1 ? snapped / (detents - 1) : 0.5)
    },
    [detents, frac],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const DELTA: Record<string, number> = {
        ArrowUp: 1,
        ArrowRight: 1,
        ArrowDown: -1,
        ArrowLeft: -1,
        PageUp: 3,
        PageDown: -3,
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        setFrac(event.key === 'Home' ? 0 : 1)
        return
      }
      const delta = DELTA[event.key]
      if (delta === undefined) return
      event.preventDefault()
      const next = clampIndex(index + delta, detents)
      setFrac(detents > 1 ? next / (detents - 1) : 0.5)
    },
    [detents, index],
  )

  const visualDetent = applyDetent(frac * (detents - 1))
  const visualDeg = detents > 1 ? -KNOB_HALF_DEG + (visualDetent / (detents - 1)) * KNOB_SWEEP_DEG : 0

  return (
    <div className="flex flex-col items-center gap-2">
      <span aria-hidden="true" className="text-[10px] font-extrabold" style={{ color: 'var(--muted)' }}>
        旋钮
      </span>
      <div
        id={id}
        ref={knobRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={detents - 1}
        aria-valuenow={index}
        aria-valuetext={`第 ${index + 1} 档，共 ${detents} 档`}
        data-detents={detents}
        data-value={index}
        data-angle={visualDeg.toFixed(2)}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative grid h-[132px] w-[132px] cursor-grab touch-none select-none place-items-center rounded-full active:cursor-grabbing"
        style={{ background: 'var(--soft)', border: '2px solid var(--line)' }}
      >
        {/* 外圈刻度环：每档一条短线，转起来能看到刻度扫过 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-full" style={{ border: '1px solid var(--line)' }} />
        {/* 内盘：真正随拖动旋转的部分 */}
        <span
          aria-hidden="true"
          className="pointer-events-none relative block h-[92px] w-[92px] rounded-full"
          style={{
            background: 'var(--cream)',
            border: '2px solid var(--ink)',
            boxShadow: '0 5px 0 var(--coral-base)',
            transform: `rotate(${visualDeg}deg)`,
            transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1.4, 0.4, 1)',
          }}
        >
          {/* 指针：初始朝上，随档位偏转 */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-[7px] h-[20px] w-[5px] -translate-x-1/2 rounded-full"
            style={{ background: 'var(--ink)' }}
          />
        </span>
      </div>
      <span className="text-[10px] font-extrabold" style={{ color: 'var(--muted)' }} data-knob-readout="">
        {readout}
      </span>
    </div>
  )
}

/* ==============================================================
 * 面板本体
 * ============================================================== */

export type TouchPanelProps = {
  /** 站点自述。从服务端传进来，不在客户端重复文案。 */
  bio: string
}

export function TouchPanel({ bio }: TouchPanelProps) {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readThemeFromDom,
    () => 'light' as Theme,
  )
  const [level, setLevel] = useState<GranularityLevel>(3)

  // 主题滑块的「已确认档位」：0 = 日间，1 = 夜间。
  // 真值来自 DOM（D-08），所以页头开关一动这里就知道。
  const themeIndex = theme === 'night' ? 1 : 0

  const handleThemeIndex = useCallback((index: number) => {
    writeTheme(index === 1 ? 'night' : 'light')
  }, [])

  const handleLevel = useCallback((index: number) => {
    const next = GRANULARITY_LEVELS[clampIndex(index, GRANULARITY_LEVELS.length)]
    setLevel(next)
  }, [])

  const knobDetents = KNOB_DETENTS[level]

  const levelText = useMemo(() => {
    const NAMES: Record<GranularityLevel, string> = {
      1: '最粗',
      2: '偏粗',
      3: '适中',
      4: '偏细',
      5: '最细',
    }
    return `${NAMES[level]} · ${knobDetents} 档`
  }, [level, knobDetents])

  return (
    <section
      aria-labelledby="touch-panel-title"
      className="relative overflow-hidden rounded-[34px] p-4 sm:p-6"
      style={{ background: 'var(--shell)' }}
    >
      <div
        className="rounded-[24px] p-5 sm:p-6"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="touch-panel-title"
              className="flex items-center gap-2 font-display text-xl"
              style={{ color: 'var(--ink)' }}
            >
              <Icon name="sentiment_satisfied" size={18} />
              触感体验面板
            </h2>
            <p className="mt-1.5 max-w-[430px] text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              这里的东西都能按。滑块与旋钮有档位吸附，拨动要花一点力气 —— 拖过头才会「咔」地落进下一档。
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-extrabold"
            style={{ background: 'var(--soft)', color: 'var(--muted)' }}
          >
            旋钮暂未绑定功能
          </span>
        </div>

        {/* 布局按参考图：左按钮组 / 中双滑块 / 右旋钮。
            用 justify-between 而不是 1fr+auto+auto —— 后者会把按钮组拉到极左、
            旋钮推到极右，中间留出一大片空白（第一版截图就是这个毛病）。
            同时给按钮组一个 max-w，避免自述文字过长把三组控件拉开。 */}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          {/* ---- 左：两个立体按钮 + 自述 ---- */}
          <div className="order-3 flex min-w-0 max-w-[330px] flex-col gap-3 lg:order-1">
            <div className="flex flex-wrap gap-3">
              <ToyButton href="/posts">
                开始阅读 <Icon name="arrow_forward" size={17} />
              </ToyButton>
              <ToyButton href="/about" variant="pink">
                关于我 <Icon name="auto_awesome" size={17} />
              </ToyButton>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
              {bio}
            </p>
          </div>

          {/* ---- 中：两个竖直滑块 ---- */}
          <div className="order-1 flex justify-center gap-4 lg:order-2 lg:gap-6">
            <DetentSlider
              detents={GRANULARITY_LEVELS.length}
              value={level - 1}
              onChange={(index) => handleLevel(index)}
              label="旋钮颗粒度"
              valueText={(index) => {
                const next = GRANULARITY_LEVELS[clampIndex(index, GRANULARITY_LEVELS.length)]
                return `第 ${next} 档，共 5 档，旋钮 ${KNOB_DETENTS[next]} 格`
              }}
              topBadge="细"
              bottomBadge="粗"
              hint="上下拖动或按上下方向键改变旋钮的档位颗粒度，一共 5 档。"
            />
            <DetentSlider
              detents={2}
              value={themeIndex}
              onChange={handleThemeIndex}
              label="明暗主题"
              valueText={(index) => (index === 1 ? '夜间' : '日间')}
              topBadge={<Icon name="dark_mode" size={13} />}
              bottomBadge={<Icon name="light_mode" size={13} />}
              hint="两档拨动开关，上为夜间、下为日间，与页头开关共用同一份主题设置。"
            />
          </div>

          {/* ---- 右：旋钮 ---- */}
          <div className="order-2 flex justify-center lg:order-3">
            <DetentKnob
              detents={knobDetents}
              label="档位旋钮"
              readout={levelText}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
