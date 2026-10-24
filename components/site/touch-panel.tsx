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
 * 阻滞-突破（stick-slip）手感的物理模型（决策 D-25）
 *
 * 【上一版错在哪】D-24 用的是「死区 + 幂曲线压缩」：拇指在档心附近不动，
 * 过了死区就按曲线平滑地跟上去。结果是拇指滞后，但**永远不会突破** ——
 * 拖多远它就滑多远，只是慢一点。那不是阻滞，那是阻尼。
 *
 * 【正确模型】真实现象是「卡住 → 蓄力 → 突然弹开」：
 *   1. 开始拖时，拇指只跟随指针的极小一部分（看起来几乎没动）—— 这就是阻滞
 *   2. 指针继续拖，累积的「未释放位移」一直增长，但**拇指仍然没动多少**
 *   3. 一旦累积位移超过阈值，拇指一下子「啪」地划到下一档
 *   4. 换档后累积位移清零，重新从阻滞状态开始
 *
 * 实现上需要两个状态，不能只靠纯函数：
 *
 *   anchor   —— 上一次突破时指针所在的档位坐标
 *   armed    —— 这一次已经累积了多少「未释放」的档位距离
 *
 * 每次 pointermove：
 *   raw    = 指针在轨道上的连续位置（0..n-1）
 *   delta  = raw - anchor          （相对上次突破点的位移）
 *   if |delta| >= threshold:       突破！
 *      anchor = raw 向前跨过整数档：直接对到最近档心，并把超出部分清零
 *      armed  = 0
 *   else:
 *      armed = delta * CREEP_RATIO  （只跟这一小部分 = 阻滞感）
 *
 * 视觉位置 = anchor 的整档 + armed。
 *
 * 为什么 CREEP_RATIO 取 0.14 这种很小的值：阻滞感来自「拇指几乎不动」这个
 * 事实。若取 0.5，看起来就像普通滑块只是打了个折，不像被卡住。
 *
 * 【阈值由旋钮控制】threshold 是 0.12..0.62 档的连续值，越小的档位（旋钮
 * 转得越“松”）阈值越大，拖起来越费劲；反之越容易拨动。
 * ============================================================== */

/** 阻滞期间拇指跟随指针的比例。越小越“卡”。 */
const CREEP_RATIO = 0.14

/** 阈值两端：越往外越难拨动。单位是“档”，半档 = 0.5。 */
const THRESHOLD_MIN = 0.12
const THRESHOLD_MAX = 0.62

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
 * 竖直档位滑块的几何（对齐参考图 img/Snipaste_2026-10-24_14-16-54.png）
 *
 * 参考图里的滑块是「细长导轨 + 宽扁拇指」：导轨明显比拇指窄，而且上下都
 * 超出拇指所在的块体。所以这里不再画一个包住整条的方框，而是：
 *   - 容器只负责命中区与坐标换算（透明，宽 72px 以满足 44px 触控目标）
 *   - 容器里单独画一条 16px 宽的导轨，拇指 64×34 横跨在导轨上
 * 行程 = 容器高度 - 2 * 内边距（拇指中心在容器内缘起止）。
 * ============================================================== */
const SLIDER_HEIGHT = 200
const SLIDER_INSET = 17
const SLIDER_HIT_WIDTH = 72
const SLIDER_RAIL_WIDTH = 16

/** 旋钮直径。参考图里旋钮与滑块导轨同高，是整块面板的视觉重心。 */
const KNOB_SIZE = 200
const KNOB_DISC = 148

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
  threshold,
}: {
  detents: number
  value: number
  onChange: (index: number) => void
  label: string
  valueText: (index: number) => string
  topBadge: ReactNode
  bottomBadge: ReactNode
  hint: string
  /** 突破阈值，单位是「档」。由旋钮控制。 */
  threshold: number
}) {
  const id = useId()
  const trackRef = useRef<HTMLDivElement>(null)
  /** 已突破到的档位坐标（整数）。拖动中被突破逐步推进。 */
  const [anchor, setAnchor] = useState(value)
  /** 阻滞期累积的「未释放」位移（档位单位，带符号，范围 ±CREEP）。 */
  const [creep, setCreep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  // 外部真值变化（例如页头切了主题）→ 重置整套状态。
  // 拖动中不同步，否则会把用户正拖着的状态打回去。
  useEffect(() => {
    if (!draggingRef.current) {
      setAnchor(value)
      setCreep(0)
    }
  }, [value])

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

  /**
   * 核心：把指针位置变成「阻滞-突破」状态。
   *
   * 返回下一个 anchor / creep，由调用方决定怎么入库。
   * 写成纯函数是为了不依赖 state 闭包（同一帧内多次 move 不会读到旧值）。
   */
  const resolve = useCallback(
    (targetRaw: number, curAnchor: number, curCreep: number) => {
      // 这一轮指针相对「上次突破点」的累积位移。
      // 把已释放的部分剔掉：anchor + creep 才是拇指当前的真实位置。
      const released = curAnchor + curCreep
      const pushed = targetRaw - released
      const total = released + pushed - curAnchor // = creep + pushed

      // 累到超过阈值 → 突破。可能一次跨多档（快速拖动），所以用 while。
      if (Math.abs(total) >= threshold) {
        const direction = total > 0 ? 1 : -1
        // 目标档位：从上一次突破点朝方向走，直接对到整数档。
        // 把「实际指针位置」四舍五入到最近整数档，同时保证至少走一档。
        const rawRounded = Math.round(targetRaw)
        let next = curAnchor + direction
        if (direction > 0) next = Math.max(next, Math.min(rawRounded, detents - 1))
        else next = Math.min(next, Math.max(rawRounded, 0))
        next = clampIndex(next, detents)
        // 换档后累积清零，重新从阻滞开始。
        return { anchor: next, creep: 0 }
      }

      // 未达阈值 → 只跟随一小部分（这就是阻滞感）。
      // 累积量本身封顶在阈值内，且乘以 CREEP_RATIO 后才用于视觉。
      return { anchor: curAnchor, creep: total * CREEP_RATIO }
    },
    [detents, threshold],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = true
      setDragging(true)
      // 按下瞬间不做「跳跃定位」——那会把阻滞感直接绕过去。
      // 只以按下的位置为新的突破基准点，拇指留在当前档位。
      const raw = rawFromPointer(event.clientY)
      const nearest = clampIndex(Math.round(raw), detents)
      setAnchor(nearest)
      setCreep(0)
      if (nearest !== value) onChange(nearest)
    },
    [detents, onChange, rawFromPointer, value],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const targetRaw = rawFromPointer(event.clientY)
      const next = resolve(targetRaw, anchor, creep)
      if (next.anchor !== anchor) {
        setAnchor(next.anchor)
        if (next.anchor !== value) onChange(next.anchor)
      }
      setCreep(next.creep)
    },
    [anchor, creep, onChange, rawFromPointer, resolve, value],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      // 松手：未达阈值的累积全部作废，拇指弹回当前档心。
      // 这正是「拨不动就弹回去」的观感。
      setCreep(0)
    },
    [],
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

  // 拇指的视觉位置 = 已突破档位 + 阻滞期累积（很小的一段）。
  // 这就是「卡住 → 蓄力 → 突然弹开」在屏幕上的全部表现。
  const visual = anchor + creep
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
        data-visual={visual.toFixed(3)}
        data-threshold={threshold.toFixed(3)}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ height: SLIDER_HEIGHT, width: SLIDER_HIT_WIDTH }}
      >
        {/* 细长导轨：比拇指窄得多，上下都探出拇指行程之外（对齐参考图）。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[10px] -top-[10px] left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: SLIDER_RAIL_WIDTH,
            background: 'var(--soft)',
            border: '2px solid var(--ink)',
            // 内阴影用 --line（由源色派生）而不是写死 rgba(0,0,0,…)。
            // D-21 已经踩过同类坑：硬编码的黑色在自定义配色下会
            // 在导轨上留一块不相干的深色（D-22 禁止组件里出现色值）。
            boxShadow: 'inset 0 2px 0 var(--line)',
          }}
        />
        {/* 档位刻痕：让「有几个档」看得见，而不是只能靠手感猜 */}
        {detentMarks.map((mark) => {
          const markFrac = detents > 1 ? mark / (detents - 1) : 1
          return (
            <span
              key={mark}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 h-[2px] w-[28px] -translate-x-1/2 rounded-full"
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
          className="pointer-events-none absolute left-1/2 grid h-[34px] w-[64px] place-items-center rounded-[11px]"
          style={{
            top: thumbTop,
            transform: 'translate(-50%, -50%)',
            background: 'var(--cream)',
            border: '2px solid var(--ink)',
            boxShadow: '0 4px 0 var(--coral-base)',
            transition: dragging ? 'none' : 'top 220ms cubic-bezier(0.22, 1.4, 0.4, 1)',
          }}
        >
          <span className="h-[2px] w-[26px] rounded-full" style={{ background: 'var(--ink)', opacity: 0.55 }} />
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
 * 与滑块共用同一套**阻滞-突破**状态机（anchor + creep），只是把线性行程换成极角。
 *
 * 旋钮的职责有两个，必须分清：
 *   1. 自己被拨动时，同样有阻滞感（anchor + creep）
 *   2. 它当前的档位**反过来决定两个滑块的突破阈值** —— 这就是用户说的
 *      「旋钮可以调节阻滞阈值，从用户角度看是调节拨动滑块的难易程度」
 *
 * 颗粒度变化时保持角度、只改档数，所以内部存的是归一化 frac。
 */
function DetentKnob({
  detents,
  label,
  readout,
  onThresholdChange,
}: {
  detents: number
  label: string
  readout: string
  /** 档位变化时上报 0..1 的「拨动难易度」（0 = 最费力，1 = 最轻）。 */
  onThresholdChange: (ease: number) => void
}) {
  const id = useId()
  const knobRef = useRef<HTMLDivElement>(null)
  /** 已突破到的档位索引（整数）。 */
  const [anchor, setAnchor] = useState(Math.round(0.52 * (detents - 1)))
  /** 阻滞期累积的未释放位移（档位单位）。 */
  const [creep, setCreep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  const index = clampIndex(anchor, detents)

  const rawFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = knobRef.current
    if (!el) return anchor
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // atan2(dx, -dy)：0° 指向正上方，顺时针为正。
    const deg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI
    const clampedDeg = deg < -KNOB_HALF_DEG ? -KNOB_HALF_DEG : deg > KNOB_HALF_DEG ? KNOB_HALF_DEG : deg
    const t = (clampedDeg + KNOB_HALF_DEG) / KNOB_SWEEP_DEG
    return t * (detents - 1)
  }, [anchor, detents])

  /** 旋钮自己的阻滞阈值：固定值，档多的旋钮自然需要更细的拖动才突破。 */
  const knobThreshold = 0.5

  const resolve = useCallback(
    (targetRaw: number, curAnchor: number, curCreep: number) => {
      const released = curAnchor + curCreep
      const total = curCreep + (targetRaw - released)
      if (Math.abs(total) >= knobThreshold) {
        const direction = total > 0 ? 1 : -1
        const rawRounded = Math.round(targetRaw)
        let next = curAnchor + direction
        if (direction > 0) next = Math.max(next, Math.min(rawRounded, detents - 1))
        else next = Math.min(next, Math.max(rawRounded, 0))
        return { anchor: clampIndex(next, detents), creep: 0 }
      }
      return { anchor: curAnchor, creep: total * CREEP_RATIO }
    },
    [detents],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = true
      setDragging(true)
      // 按下不改位置（不做跳跃定位），只清空累积。
      setCreep(0)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const targetRaw = rawFromPointer(event.clientX, event.clientY)
      const next = resolve(targetRaw, anchor, creep)
      if (next.anchor !== anchor) {
        setAnchor(next.anchor)
        // 档位变了 → 上报「拨动难易度」。越小越费力。
        onThresholdChange(detents > 1 ? next.anchor / (detents - 1) : 0.5)
      }
      setCreep(next.creep)
    },
    [anchor, creep, detents, onThresholdChange, rawFromPointer, resolve],
  )

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setCreep(0)
    },
    [],
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
      const commitIndex = (next: number) => {
        const clamped = clampIndex(next, detents)
        setAnchor(clamped)
        setCreep(0)
        onThresholdChange(detents > 1 ? clamped / (detents - 1) : 0.5)
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        commitIndex(event.key === 'Home' ? 0 : detents - 1)
        return
      }
      const delta = DELTA[event.key]
      if (delta === undefined) return
      event.preventDefault()
      commitIndex(index + delta)
    },
    [detents, index, onThresholdChange],
  )

  const visualDetent = anchor + creep
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
        className="relative grid cursor-grab touch-none select-none place-items-center rounded-full active:cursor-grabbing"
        style={{ width: KNOB_SIZE, height: KNOB_SIZE, background: 'var(--soft)', border: '2px solid var(--line)' }}
      >
        {/* 外圈刻度环：转起来能看到刻度扫过 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[10px] rounded-full"
          style={{ border: '1px solid var(--line)' }}
        />
        {/* 内盘：真正随拖动旋转的部分 */}
        <span
          aria-hidden="true"
          className="pointer-events-none relative block rounded-full"
          style={{
            width: KNOB_DISC,
            height: KNOB_DISC,
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
            className="absolute left-1/2 top-[9px] h-[28px] w-[6px] -translate-x-1/2 rounded-full"
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

  // 旋钮上报的「拨动难易度」：1 = 最轻、0 = 最费力。
  // 它反过来是两个滑块的突破阈值 —— 这就是用户要的「用旋钮调阻滞阈值」。
  const [ease, setEase] = useState(0.5)

  // ease=1（最轻）→ THRESHOLD_MIN；ease=0（最费力）→ THRESHOLD_MAX。
  const threshold = THRESHOLD_MAX - ease * (THRESHOLD_MAX - THRESHOLD_MIN)

  const handleThresholdChange = useCallback((next: number) => {
    setEase(next < 0 ? 0 : next > 1 ? 1 : next)
  }, [])

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
            {/* 自述原来放在左栏里，把那一栏撑得比参考图高很多。
                参考图左栏只有两块矩形，所以自述上移到标题区。 */}
            <p className="mt-1.5 max-w-[430px] text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {bio}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-extrabold"
            style={{ background: 'var(--soft)', color: 'var(--muted)' }}
          >
            旋钮暂未绑定功能
          </span>
        </div>

        {/* 布局严格对齐参考图 img/Snipaste_2026-10-24_14-16-54.png：
            左 = 两块上下堆叠的立体按钮（高矮不一），中 = 两根细长竖直滑块，
            右 = 一个大旋钮（直径与滑块导轨同高，是整块面板的视觉重心）。
            三组控件在同一行横向铺开、间距均匀；整行用固定 gap 居中收紧，
            而不是 justify-between —— 后者会把按钮组与旋钮顶到两端、中间留白。 */}
        <div className="mt-7 flex flex-col items-center gap-6 lg:mt-8 lg:flex-row lg:items-center lg:justify-center lg:gap-10">
          {/* ---- 左：两块立体按钮 ---- */}
          <div className="order-3 flex w-full max-w-[360px] flex-col gap-4 lg:order-1 lg:w-[360px] lg:shrink-0">
            <ToyButton
              href="/posts"
              size="large"
              className="w-full"
              topClassName="h-[74px] justify-between px-6"
            >
              开始阅读 <Icon name="arrow_forward" size={17} />
            </ToyButton>
            <ToyButton
              href="/about"
              size="large"
              variant="pink"
              className="w-full"
              topClassName="h-[96px] justify-between px-6"
            >
              关于我 <Icon name="auto_awesome" size={17} />
            </ToyButton>
          </div>

          {/* ---- 中：两根细长竖直滑块 ---- */}
          <div className="order-1 flex justify-center gap-3 lg:order-2 lg:gap-9">
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
              threshold={threshold}
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
              threshold={threshold}
            />
          </div>

          {/* ---- 右：旋钮 ---- */}
          <div className="order-2 flex justify-center lg:order-3 lg:shrink-0">
            <DetentKnob
              detents={knobDetents}
              label="档位旋钮"
              readout={levelText}
              onThresholdChange={handleThresholdChange}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
