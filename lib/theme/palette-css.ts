import 'server-only'

import type { PaletteColors } from '@/config/palette'

/**
 * 5 色配色体系 —— token 派生层（决策 D-22）。
 *
 * 把 `config/palette.ts` 里的 5 个颜色推导成站内全部语义 token，并输出成一段
 * CSS 注入到根布局的 `<head>`。**全站只有 5 个颜色值是「真的」，其余都是派生结果。**
 *
 * ## 核心思路：以对比度为约束求解，而不是猜混合比例
 *
 * 第一版实现是「往白里混 62% 得到 muted」这类固定比例。实测 6 套预设 × 日夜两态
 * 立刻暴露出 27 项失败 —— 因为不同色卡的明度差得很远，固定比例不可能同时成立。
 *
 * 现在的做法是：先给出一个**起点**（语义上大致合理的混合），再用
 * `ensureContrast()` 朝正确方向逐步调整，**直到达到目标对比度为止**。
 * 于是「文字读得清」是构造出来的保证，不是碰巧。
 *
 * ## 为什么派生放在 TypeScript 而不是 CSS `color-mix()`
 *
 * 1. **对比度必须能算**。CSS 无法按亮度分支，只能写死；TS 可以求解。
 * 2. **可以在 Node 里断言**。不用开浏览器就能发现「某个预设按钮文字看不清」。
 * 3. **不依赖浏览器特性**。`color-mix()` 在旧浏览器上会整条失效，颜色全丢。
 *
 * 代价是切换配色需要重新构建。这是可接受的：配色属于站点身份，不是运行时开关。
 *
 * ## 白与黑不是第 6、第 7 个颜色
 *
 * 派生需要「往亮里调」和「往暗里调」两个端点，这里用纯白与纯黑承担。
 * 它们不参与配色决策，只作为混合端点 —— 任何配色系统都躲不开这一步。
 */

type Rgb = { r: number; g: number; b: number }

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

/** WCAG AA 正文对比度。 */
const AA_TEXT = 4.5
/** 大号文字与图形元素的最低对比度。 */
const AA_LARGE = 3

function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(
      `[palette] 非法颜色值 ${JSON.stringify(hex)}：需要 3 位或 6 位十六进制，例如 #ff656c`,
    )
  }

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** `t` 是 `b` 的权重：`t = 0` 得到 `a`，`t = 1` 得到 `b`。 */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function alpha(c: Rgb, a: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG 相对亮度。 */
function luminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

/** WCAG 对比度，1:1 至 21:1。 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 往白里混，`t` 越大越浅。 */
const tint = (c: Rgb, t: number) => mix(c, WHITE, t)
/** 往黑里混，`t` 越大越深。 */
const shade = (c: Rgb, t: number) => mix(c, BLACK, t)

/**
 * 朝指定方向逐步调整 `color`，直到它与 `against` 的对比度达到 `target`。
 *
 * 这是整个派生层的核心：**所有可读性都由它保证**。
 * 起点已经达标就直接返回原值，因此不会无故改动配色本来的观感。
 *
 * `direction` 必须写对：深色文字配浅底要 `'darker'`，浅色文字配深底要 `'lighter'`。
 * 方向写反会让循环一路走到端点，得到一个与设计意图相反的颜色。
 */
function ensureContrast(
  color: Rgb,
  against: Rgb | Rgb[],
  target: number,
  direction: 'lighter' | 'darker',
): Rgb {
  // 比较前先过一道 hex 舍入：最终写进 CSS 的是舍入后的值，
  // 若拿未舍入的浮点去判定，会出现「算出来 7.00、写出去 6.98」这种差一点点。
  const round = (c: Rgb) => parseHex(toHex(c))
  // 可传入多个背景，必须全部达标。文字实际会同时出现在 canvas 与 surface 上，
  // 只对其中一个求解会在另一个上不达标 —— 这是实测踩到的真问题。
  const refs = (Array.isArray(against) ? against : [against]).map(round)
  const ok = (c: Rgb) => refs.every((r) => contrastRatio(c, r) >= target)

  if (ok(round(color))) return round(color)

  const endpoint = direction === 'lighter' ? WHITE : BLACK
  for (let t = 0.02; t <= 0.98; t += 0.02) {
    const candidate = round(mix(color, endpoint, t))
    if (ok(candidate)) return candidate
  }
  return round(mix(color, endpoint, 0.98))
}

/**
 * 按钮面：保证深色文字写上去达到 AA。
 *
 * 参考色卡里有些主色本身偏深（例如港湾卡的 `#0063bf`），直接当按钮面用会让
 * 深色文字对比度不足。这里提亮到能读为止。
 */
function capOn(color: Rgb, onAccent: Rgb): Rgb {
  return ensureContrast(color, onAccent, AA_TEXT, 'lighter')
}

/** 派生结果的键值对，直接写进 CSS 自定义属性。 */
export type PaletteTokens = Record<string, string>

/**
 * 从 5 个颜色派生日间 token。
 *
 * 槽位语义见 `config/palette.ts`：
 * `p1` 主强调色、`p2` 次强调色、`p3` 第三强调色、`p4` 深中性 1、`p5` 最深。
 */
export function deriveLightTokens(colors: PaletteColors): PaletteTokens {
  const [p1, p2, p3, , p5] = colors.map(parseHex) as [Rgb, Rgb, Rgb, Rgb, Rgb]

  // 画布：次强调色的极浅版，带一点色相，不是死白。
  const canvas = tint(p2, 0.95)
  const surface = tint(p2, 0.985)

  // 正文：从最深的槽位再压暗，然后强制达到 AAA 级对比（7:1）。
  // 同时对 canvas 与 surface 求解 —— 文字两个背景上都会出现。
  const ink = ensureContrast(shade(p5, 0.16), [canvas, surface], 7, 'darker')

  // 次要文字：以「正文与画布的中点」为起点，再强制达到 AA（4.5:1）。
  // 起点用中点而不是固定往白里混，是因为浅色卡上往白混会直接糊掉。
  const muted = ensureContrast(mix(ink, canvas, 0.45), [canvas, surface], AA_TEXT, 'darker')

  // 按钮面上的文字：从最深槽位压暗，作为所有 cap 的可读性基准。
  const onAccent = shade(p5, 0.34)

  return {
    // ---- 中性层 ----
    '--canvas': toHex(canvas),
    '--surface': toHex(surface),
    '--soft': toHex(tint(p2, 0.84)),
    '--shell': toHex(tint(p1, 0.72)),
    '--ink': toHex(ink),
    '--muted': toHex(muted),
    '--line': alpha(p5, 0.12),
    '--grid': alpha(p5, 0.08),
    // 焦点环必须能在画布上看清（WCAG 非文本对比 3:1）。
    '--focus': toHex(ensureContrast(p3, canvas, AA_LARGE, 'darker')),
    '--shadow': `0 9px 0 ${alpha(shade(p5, 0.1), 0.16)}`,
    '--on-accent': toHex(onAccent),

    // ---- 六个语义色对：cap（亮面）+ base（深底座）----
    // coral = 主强调色，承担主 CTA
    '--coral': toHex(capOn(p1, onAccent)),
    '--coral-base': toHex(shade(p1, 0.58)),

    // pink = 主强调色的柔和版，用于次级 CTA
    '--pink': toHex(capOn(tint(p1, 0.38), onAccent)),
    '--pink-base': toHex(shade(p1, 0.5)),

    // cream = 次强调色的极浅版，用于标签、徽标、浅底块
    '--cream': toHex(capOn(tint(p2, 0.78), onAccent)),
    '--cream-base': toHex(shade(p2, 0.45)),

    // mint = 次强调色本体
    '--mint': toHex(capOn(p2, onAccent)),
    '--mint-base': toHex(shade(p2, 0.45)),

    // sky = 第三强调色本体，与焦点环同源
    '--sky': toHex(capOn(p3, onAccent)),
    '--sky-base': toHex(shade(p3, 0.45)),

    // lilac = 主强调色与第三强调色的混合，取一个介于两者之间的色相
    '--lilac': toHex(capOn(tint(mix(p1, p3, 0.5), 0.2), onAccent)),
    '--lilac-base': toHex(shade(mix(p1, p3, 0.5), 0.5)),
  }
}

/**
 * 从 5 个颜色派生夜间 token。
 *
 * 夜间不是把日间取反，而是「同一个玩具盒关灯之后」：
 * 底色从最深槽位往黑里压，表面色比底色略亮，强调色保持高饱和。
 *
 * 注意 `--surface` 必须从 `canvas` 提亮，不能从 `p5` 提亮 ——
 * 后者在浅色卡上会直接跳到中间灰，把夜间变成灰蒙蒙一片。
 */
export function deriveNightTokens(colors: PaletteColors): PaletteTokens {
  const [p1, p2, p3, , p5] = colors.map(parseHex) as [Rgb, Rgb, Rgb, Rgb, Rgb]

  const canvas = shade(p5, 0.34)
  const surface = tint(canvas, 0.08)

  // 夜间 surface 比 canvas 亮（提亮 8%），所以最差情况是 surface，
  // 不是 canvas。两个都传进去，保证文字在哪一层上都达标。
  const ink = ensureContrast(tint(p2, 0.9), [canvas, surface], 7, 'lighter')
  const muted = ensureContrast(mix(canvas, ink, 0.6), [canvas, surface], AA_TEXT, 'lighter')

  const onAccent = shade(p5, 0.34)

  return {
    '--canvas': toHex(canvas),
    '--surface': toHex(surface),
    '--soft': toHex(tint(canvas, 0.14)),
    '--shell': toHex(tint(p1, 0.18)),
    '--ink': toHex(ink),
    '--muted': toHex(muted),
    '--line': alpha(ink, 0.14),
    '--grid': alpha(ink, 0.08),
    '--focus': toHex(ensureContrast(tint(p3, 0.25), canvas, AA_LARGE, 'lighter')),
    '--shadow': `0 9px 0 ${alpha(BLACK, 0.3)}`,
    '--on-accent': toHex(onAccent),

    '--coral': toHex(capOn(p1, onAccent)),
    '--coral-base': toHex(shade(p1, 0.7)),

    '--pink': toHex(capOn(tint(p1, 0.38), onAccent)),
    '--pink-base': toHex(shade(p1, 0.66)),

    '--cream': toHex(capOn(tint(p2, 0.74), onAccent)),
    '--cream-base': toHex(shade(p2, 0.6)),

    '--mint': toHex(capOn(p2, onAccent)),
    '--mint-base': toHex(shade(p2, 0.6)),

    '--sky': toHex(capOn(p3, onAccent)),
    '--sky-base': toHex(shade(p3, 0.6)),

    '--lilac': toHex(capOn(tint(mix(p1, p3, 0.5), 0.2), onAccent)),
    '--lilac-base': toHex(shade(mix(p1, p3, 0.5), 0.62)),
  }
}

function declarations(tokens: PaletteTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `${key}: ${value};`)
    .join('')
}

/**
 * 生成注入到 `<head>` 的整段配色 CSS。
 *
 * 注意：`app/globals.css` 里**不再**定义任何颜色 token，颜色只由这里产出，
 * 因此不存在「两处定义谁覆盖谁」的顺序问题。
 */
export function buildPaletteCss(colors: PaletteColors): string {
  const raw: PaletteTokens = {
    '--palette-1': colors[0],
    '--palette-2': colors[1],
    '--palette-3': colors[2],
    '--palette-4': colors[3],
    '--palette-5': colors[4],
  }

  return [
    `:root{${declarations(raw)}${declarations(deriveLightTokens(colors))}}`,
    `:root[data-theme='night']{${declarations(deriveNightTokens(colors))}}`,
  ].join('\n')
}
