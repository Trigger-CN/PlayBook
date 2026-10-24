'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
 *   anchor —— 上一次突破时所在/已确认的整数档位
 *   creep  —— 这一次已经累积的「未释放」跟随量（档位单位，带符号）
 *
 * 视觉位置 = anchor + creep。
 *
 * 为什么 CREEP_RATIO 取 0.14 这种很小的值：阻滞感来自「拇指几乎不动」这个
 * 事实。若取 0.5，看起来就像普通滑块只是打了个折，不像被卡住。
 * ============================================================== */

/** 阻滞期间拇指跟随指针的比例。越小越“卡”。 */
const CREEP_RATIO = 0.14

/**
 * 阈值两端（单位是「档」）：从**当前档心**算起，指针必须拖过这么远才突破。
 *
 * 【下限必须是 0.5，这是硬约束不是调参】
 * 0.5 档正好是「两个档位的中点」，也就是档界所在的几何位置。
 * 阈值小于 0.5 时，指针还停在两档之间（没越过分界线）就已经满足突破条件；
 * 突破后指针仍未越界，下一次 pointermove 又满足条件 —— 于是档位在两档之间
 * 反复翻转，屏幕上就是「滑块在闪」。
 *
 * 0.5 = 一过中点就弹（最轻）；0.95 = 几乎拖到下一档才弹（最费力）。
 */
const THRESHOLD_MIN = 0.5
const THRESHOLD_MAX = 0.95

/**
 * 回差（hysteresis）：退回方向比推进方向多拖这么多档才生效。
 *
 * 没有回差时，突破与回退发生在同一个坐标点上。指针恰好停在那个坐标（例如
 * 两档中点）时，操作系统的亚像素抖动就会让判据一帧成立、下一帧不成立 ——
 * 档位在相邻两档之间反复翻转，即用户看到的「闪」。
 */
const HYSTERESIS = 0.6

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
 * 视觉体系：纯色色块，不用线条勾勒（与 ToyButton 同源）
 *
 * 【为什么去掉描边】D-25 用 `border: 2px solid var(--ink)` 勾出控件轮廓，
 * 那是「线稿」语言。ToyButton 是靠「亮色 cap 压在暗色 base 上」形成体积的，
 * 全站按钮没有一个描边。控件要与之统一，就必须同样只用实色面 + 侧面。
 *
 * 【滑块的侧面方向随位置翻转】
 * 滑块在上侧 → 侧壁露在下方；在下侧 → 侧壁露在上方；正中 → 完全重合。
 * 用 `2 * frac - 1` 把「离中心的归一化位置」映射成 -1..+1，再乘深度即可：
 *   frac = 1（顶部）→ +depth（base 下移，露在下方）
 *   frac = 0（底部）→ -depth（base 上移，露在上方）
 *   frac = 0.5（正中）→ 0（完全重合，不露侧壁）
 * ============================================================== */

const SLIDER_HEIGHT = 260
const SLIDER_INSET = 24
const SLIDER_HIT_WIDTH = 88
const SLIDER_RAIL_WIDTH = 20
const THUMB_W = 80
const THUMB_H = 40
/** 滑块侧壁的最大露出深度。 */
const THUMB_DEPTH = 9

/** 旋钮：两个等大的圆（cap 在上、base 在下）上下错开。 */
const KNOB_SIZE = 300
const KNOB_DISC = 224
/** cap 与 base 的错开量。base 不随转动。 */
const KNOB_DEPTH = 14
/** 刻度环半径区间：内端被 cap 压住，外端露出。 */
const KNOB_TICK_INNER = 88
const KNOB_TICK_OUTER = 128

/** 旋钮刻度在改颗粒度时的淡出 → 换数量 → 淡入时长。 */
const TICK_FADE_MS = 110

/**
 * 竖直档位滑块。
 *
 * 为什么用 role="slider" 而不是原生 <input type="range">：原生 range 的拇指
 * 由浏览器绘制，无法呈现「指针在动、拇指不动」的磁滞手感；而 `step` 又会在
 * 边界瞬间跳变。自定义控件负责绘制，但**键盘与 ARIA 必须自己补全**：
 * ↑/→ +1、↓/← -1、Home/End 到两端、PageUp/PageDown 跨两档。
 *
 * 受控：外部 `value` 是唯一真值，内部只保留拖动中的连续坐标。
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
  /** 已突破到的档位坐标（整数）。用 state 只是为了驱动渲染。 */
  const [anchor, setAnchor] = useState(value)
  /** 阻滞期累积的「未释放」位移（档位单位，带符号）。 */
  const [creep, setCreep] = useState(0)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  /**
   * 拖动期间的**权威真值**。
   *
   * 【为什么不能只靠 state】setState 是异步的，而 pointermove 可能在同一帧
   * 内连着来好几个（高频鼠标/触控笔）。每个 handler 都闭包捕获渲染时的
   * anchor，于是后一个事件拿到的是**旧** anchor，算出错误的 total 并反向
   * 翻转 —— 这也是「闪」的第三个来源。ref 是同步写，不会被异步更新拖后。
   */
  const anchorRef = useRef(value)
  const creepRef = useRef(0)

  // 外部真值变化（例如页头切了主题）→ 重置整套状态。
  // 拖动中不同步，否则会把用户正拖着的状态打回去。
  useEffect(() => {
    if (!draggingRef.current) {
      anchorRef.current = value
      creepRef.current = 0
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
   * 【为什么之前会在两档中间闪】旧判据只看累积量 `|total| >= threshold`，
   * 而 threshold 的下限曾是 0.12 档 —— 远小于半档（0.5）。于是指针停在两档
   * 中点时，指针每一丁点抖动都会满足判据；一旦突破，anchor 被设到
   * `round(raw)`，而下一个事件里 `raw` 仍在中点附近，于是再次满足判据、
   * 反向突回去 —— 屏幕上就是拇指在两档之间来回跳。
   *
   * 【两个修正】① 阈值几何下限 ≥ 0.5；② 回差把突破点与回退点错开。
   */
  const resolve = useCallback(
    (targetRaw: number, curAnchor: number, curCreep: number) => {
      // 注意：curCreep 在代数上会抵消 ——
      //   total = creep + (raw - (anchor + creep)) = raw - anchor
      // 留着这个形只为了让「拇指当前位置 = anchor + creep」在代码里可见。
      const released = curAnchor + curCreep
      const total = curCreep + (targetRaw - released)

      // 回退比推进需要多拖一段：这就是回差，消除中点上必然出现的来回翻转。
      const need = total > 0 ? threshold : threshold + HYSTERESIS

      if (Math.abs(total) >= need) {
        // 目标档位：对到最近的整数档。快速拖动可一次跨多档。
        const next = clampIndex(Math.round(targetRaw), detents)
        // 若四舍五入后其实没换档（指针只跨了一部分），就不算突破。
        if (next !== curAnchor) {
          // 换档后累积清零，重新从阻滞开始。
          return { anchor: next, creep: 0 }
        }
      }

      // 未达阈值 → 只跟随一小部分（这就是阻滞感）。
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
      // 按下不改位置（不做跳跃定位）——那会把阻滞感直接绕过去。
      // 以当前已确认档位为基准点，ref 同步写入。
      anchorRef.current = value
      creepRef.current = 0
      setAnchor(value)
      setCreep(0)
    },
    [value],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const targetRaw = rawFromPointer(event.clientY)
      const next = resolve(targetRaw, anchorRef.current, creepRef.current)
      if (next.anchor !== anchorRef.current) {
        anchorRef.current = next.anchor
        setAnchor(next.anchor)
        // 档位变了 → 立即上报，外部真值（主题 cookie / 颗粒度）跟着变。
        onChange(next.anchor)
      }
      creepRef.current = next.creep
      setCreep(next.creep)
    },
    [onChange, rawFromPointer, resolve],
  )

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // 松手：未达阈值的累积全部作废，拇指弹回当前档心。
    // 这正是「拨不动就弹回去」的观感。
    creepRef.current = 0
    setCreep(0)
  }, [])

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
  const visual = anchor + creep
  const frac = detents > 1 ? visual / (detents - 1) : 1
  const thumbTop = `calc(${SLIDER_INSET}px + (100% - ${SLIDER_INSET * 2}px) * ${1 - frac})`
  // 侧壁偏移：顶部时 base 下移（露在下方）、底部时上移（露在上方）、正中重合。
  const wallOffset = THUMB_DEPTH * (2 * frac - 1)

  const detentMarks = useMemo(
    () => Array.from({ length: detents }, (_, i) => i),
    [detents],
  )

  return (
    <div className="flex flex-col items-center gap-2.5">
      <span aria-hidden="true" className="text-[11px] font-extrabold" style={{ color: 'var(--muted)' }}>
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
        data-wall={wallOffset.toFixed(3)}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ height: SLIDER_HEIGHT, width: SLIDER_HIT_WIDTH }}
      >
        {/* 滑槽：一条纯色圆角实块，不用描边。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
          style={{
            width: SLIDER_RAIL_WIDTH,
            height: SLIDER_HEIGHT,
            background: 'var(--line)',
          }}
        />
        {/* 滑槽两侧的刻度：每个档位一对实色短条。当前档更实一档。 */}
        {detentMarks.map((mark) => {
          const markFrac = detents > 1 ? mark / (detents - 1) : 1
          const y = `calc(${SLIDER_INSET}px + (100% - ${SLIDER_INSET * 2}px) * ${1 - markFrac})`
          const active = mark === value
          return (
            <span key={mark} aria-hidden="true" className="pointer-events-none">
              <span
                className="absolute rounded-[2px]"
                style={{
                  top: y,
                  left: 20,
                  width: 10,
                  height: 4,
                  transform: 'translateY(-50%)',
                  background: 'var(--ink)',
                  opacity: active ? 0.75 : 0.28,
                }}
              />
              <span
                className="absolute rounded-[2px]"
                style={{
                  top: y,
                  left: 58,
                  width: 10,
                  height: 4,
                  transform: 'translateY(-50%)',
                  background: 'var(--ink)',
                  opacity: active ? 0.75 : 0.28,
                }}
              />
            </span>
          )
        })}
        {/* 滑块本体：两层纯色块。base 是侧面，cap 是正面。
            拖动中关掉 transition：磁滞手感本身就是位移曲线，再叠一层补间
            等于双重延迟，会发黏。松手才开 transition 让拇指优雅落回档心。 */}
        <span
          aria-hidden="true"
          data-thumb=""
          className="pointer-events-none absolute left-1/2"
          style={{
            top: thumbTop,
            width: THUMB_W,
            height: THUMB_H,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            data-thumb-wall=""
            className="absolute inset-0 rounded-[13px]"
            style={{
              background: 'var(--coral-base)',
              transform: `translateY(${wallOffset}px)`,
              transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1.4, 0.4, 1)',
            }}
          />
          <span
            data-thumb-cap=""
            className="absolute inset-0 grid place-items-center rounded-[13px]"
            style={{ background: 'var(--cream)' }}
          >
            <span
              className="block h-[6px] w-[6px] rounded-full"
              style={{ background: 'var(--coral-base)' }}
            />
          </span>
        </span>
      </div>

      <span aria-hidden="true" className="text-[11px] font-extrabold" style={{ color: 'var(--muted)' }}>
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
 * 视觉上是两个等大的圆上下错开：cap（亮色，跟随档位旋转）在上、base（暗色
 * 侧壁，不转动）在下。刻度环围绕 base，位于 base 之上、cap 之下，于是 cap
 * 会压住刻度环的内侧一截 —— 这就是立体感的来源。
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

  // 拖动中的同步真值（理由同滑块：同一帧多次 pointermove 会读到旧 state）。
  const anchorRef = useRef(index)
  const creepRef = useRef(0)

  /**
   * 刻度环的「滞后档数」：改颗粒度时先淡出旧刻度，等透明度归零再换成新的
   * 数量并淡入。直接把数量换掉会看到一圈刻度「瞬间重排」，很像抖动。
   */
  const [tickDetents, setTickDetents] = useState(detents)
  const [tickVisible, setTickVisible] = useState(true)
  useEffect(() => {
    if (detents === tickDetents) return
    setTickVisible(false)
    const timer = setTimeout(() => {
      setTickDetents(detents)
      setTickVisible(true)
    }, TICK_FADE_MS)
    return () => clearTimeout(timer)
  }, [detents, tickDetents])

  const rawFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = knobRef.current
    if (!el) return anchorRef.current
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // atan2(dx, -dy)：0° 指向正上方，顺时针为正。
    const deg = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI
    const clampedDeg = deg < -KNOB_HALF_DEG ? -KNOB_HALF_DEG : deg > KNOB_HALF_DEG ? KNOB_HALF_DEG : deg
    const t = (clampedDeg + KNOB_HALF_DEG) / KNOB_SWEEP_DEG
    return t * (detents - 1)
  }, [detents])

  /**
   * 旋钮自己的阻滞阈值：固定值，档多的旋钮自然需要更细的拖动才突破。
   *
   * 【下限同样是 0.5】与滑块同理：小于半档时判据会在指针越过档界之前成立，
   * 指针停在两档之间就能来回翻转。再加回差把突破点与回退点错开。
   */
  const knobThreshold = 0.5
  const knobHysteresis = 0.6

  const resolve = useCallback(
    (targetRaw: number, curAnchor: number, curCreep: number) => {
      const released = curAnchor + curCreep
      const total = curCreep + (targetRaw - released)
      const need = total > 0 ? knobThreshold : knobThreshold + knobHysteresis
      if (Math.abs(total) >= need) {
        const next = clampIndex(Math.round(targetRaw), detents)
        if (next !== curAnchor) return { anchor: next, creep: 0 }
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
      anchorRef.current = index
      creepRef.current = 0
      setCreep(0)
    },
    [index],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const targetRaw = rawFromPointer(event.clientX, event.clientY)
      const next = resolve(targetRaw, anchorRef.current, creepRef.current)
      if (next.anchor !== anchorRef.current) {
        anchorRef.current = next.anchor
        setAnchor(next.anchor)
        // 档位变了 → 上报「拨动难易度」。越小越费力。
        onThresholdChange(detents > 1 ? next.anchor / (detents - 1) : 0.5)
      }
      creepRef.current = next.creep
      setCreep(next.creep)
    },
    [detents, onThresholdChange, rawFromPointer, resolve],
  )

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    creepRef.current = 0
    setCreep(0)
  }, [])

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
        anchorRef.current = clamped
        creepRef.current = 0
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

  const tickMarks = useMemo(
    () => Array.from({ length: tickDetents }, (_, i) => i),
    [tickDetents],
  )
  // 档数少时刻度加长加粗，档数多时收细，否则 36 档会连成一片。
  const tickLen = KNOB_TICK_OUTER - KNOB_TICK_INNER
  const tickW = tickDetents > 20 ? 4 : tickDetents > 10 ? 5 : 7

  return (
    <div className="flex flex-col items-center gap-2.5">
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
        data-tick-detents={tickDetents}
        data-tick-visible={tickVisible ? 'true' : 'false'}
        data-angle={visualDeg.toFixed(2)}
        data-dragging={dragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ width: KNOB_SIZE, height: KNOB_SIZE }}
      >
        {/* ① 底面圆（侧面阴影）：不随转动，比顶面低 KNOB_DEPTH/2。 */}
        <span
          aria-hidden="true"
          data-knob-base=""
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: KNOB_DISC,
            height: KNOB_DISC,
            background: 'var(--coral-base)',
            transform: `translate(-50%, -50%) translateY(${KNOB_DEPTH / 2}px)`,
          }}
        />
        {/* ② 刻度环：圆心对准底面圆，夹在底面与顶面之间，所以内侧被顶面压住。
            改颗粒度时快速淡出 → 换数量 → 淡入。 */}
        <span
          aria-hidden="true"
          data-knob-ticks=""
          className="pointer-events-none absolute inset-0"
          style={{
            transform: `translateY(${KNOB_DEPTH / 2}px)`,
            opacity: tickVisible ? 1 : 0,
            transition: `opacity ${TICK_FADE_MS}ms ease`,
          }}
        >
          {tickMarks.map((mark) => {
            const deg = tickDetents > 1
              ? -KNOB_HALF_DEG + (mark / (tickDetents - 1)) * KNOB_SWEEP_DEG
              : 0
            const dist = (KNOB_TICK_INNER + KNOB_TICK_OUTER) / 2
            const active = mark === index
            return (
              <span
                key={mark}
                className="absolute left-1/2 top-1/2 block rounded-[2px]"
                style={{
                  width: tickW,
                  height: tickLen,
                  marginLeft: -tickW / 2,
                  marginTop: -tickLen / 2,
                  transform: `rotate(${deg}deg) translateY(-${dist}px)`,
                  background: 'var(--ink)',
                  opacity: active ? 0.85 : 0.3,
                }}
              />
            )
          })}
        </span>
        {/* ③ 顶面圆：随档位旋转，压在刻度环之上。 */}
        <span
          aria-hidden="true"
          data-knob-cap=""
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: KNOB_DISC,
            height: KNOB_DISC,
            background: 'var(--cream)',
            transform: `translate(-50%, -50%) translateY(-${KNOB_DEPTH / 2}px) rotate(${visualDeg}deg)`,
            transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1.4, 0.4, 1)',
          }}
        >
          {/* 指针：初始朝上，随档位偏转。实心色块，不描边。 */}
          <span
            className="absolute left-1/2 top-[14px] h-[46px] w-[12px] -translate-x-1/2 rounded-full"
            style={{ background: 'var(--coral-base)' }}
          />
        </span>
      </div>
      <span className="text-[11px] font-extrabold" style={{ color: 'var(--muted)' }} data-knob-readout="">
        {readout}
      </span>
    </div>
  )
}

/* ==============================================================
 * 面板本体
 * ============================================================== */

export function TouchPanel() {
  const theme = useSyncExternalStore<Theme>(
    subscribeTheme,
    readThemeFromDom,
    () => 'light' as Theme,
  )
  const [level, setLevel] = useState<GranularityLevel>(3)

  // 旋钮上报的「拨动难易度」：1 = 最轻、0 = 最费力。
  // 它反过来是两个滑块的突破阈值 —— 这就是「用旋钮调阻滞阈值」。
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
      className="relative overflow-hidden rounded-[34px] p-4 sm:p-6 lg:p-8"
      style={{ background: 'var(--shell)' }}
    >
      <div
        className="rounded-[24px] p-5 sm:p-6 lg:p-8"
        style={{ background: 'var(--surface)' }}
      >
        {/* 布局：左右两大块。
            左 = 标题 + 两个按钮（开始阅读更大，是主入口）。
            右 = 两个滑块 + 旋钮，整组在列内垂直居中。
            两列的间距与卡片内边距取同一量级，四周留白因此基本一致；
            整行用 justify-center 居中而不是 justify-between —— 后者会把两块
            顶到两端、中间挖出一个大洞（第一版就是那样被否掉的）。 */}
        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-center lg:gap-14">
          {/* ---- 左：标题 + 两个按钮 ---- */}
          <div className="order-1 flex w-full flex-col gap-5 lg:w-[460px] lg:shrink-0">
            <h2
              id="touch-panel-title"
              className="flex items-center gap-2 font-display text-2xl"
              style={{ color: 'var(--ink)' }}
            >
              <Icon name="sentiment_satisfied" size={20} />
              触感体验面板
            </h2>
            <ToyButton
              href="/posts"
              size="large"
              className="w-full"
              topClassName="h-[112px] justify-between px-7 text-[19px]"
            >
              开始阅读 <Icon name="arrow_forward" size={20} />
            </ToyButton>
            <ToyButton
              href="/about"
              size="large"
              variant="pink"
              className="w-full"
              topClassName="h-[80px] justify-between px-7"
            >
              关于我 <Icon name="auto_awesome" size={18} />
            </ToyButton>
          </div>

          {/* ---- 右：两个滑块 + 旋钮 ---- */}
          <div className="order-2 flex items-center justify-center gap-6 lg:shrink-0 lg:gap-7">
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
              topBadge={<Icon name="dark_mode" size={14} />}
              bottomBadge={<Icon name="light_mode" size={14} />}
              hint="两档拨动开关，上为夜间、下为日间，与页头开关共用同一份主题设置。"
              threshold={threshold}
            />
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
