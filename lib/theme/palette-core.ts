/**
 * 5 色配色体系 —— token 派生层（决策 D-22 / D-23）。
 *
 * ## 这个文件必须保持「可在客户端运行」
 *
 * 不 `import 'server-only'`、不读 `process.env`、不碰 DOM、不用 Node 内置模块。
 * 它只做纯色彩数学：hex 解析、混色、WCAG 对比度、对比度求解、日夜两套派生。
 *
 * 原因（D-23）：首页的配色实验室要在浏览器里**实时**把 5 个源色重新派生一遍。
 * 若在客户端复制一份公式，运行时预览必然与构建产物漂移 —— 于是把公式收在这里，
 * 服务端（构建期注入 CSS）与客户端（拖动滑块）跑的是同一份代码。
 *
 * 需要 server-only 守卫的入口见 `lib/theme/palette-css.ts`。
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
 * ## 白与黑不是第 6、第 7 个颜色
 *
 * 派生需要「往亮里调」和「往暗里调」两个端点，这里用纯白与纯黑承担。
 * 它们不参与配色决策，只作为混合端点 —— 任何配色系统都躲不开这一步。
 */

type Rgb = { r: number; g: number; b: number }

/** HSL，`h` 为 0–360 度，`s` / `l` 为 0–100。 */
export type Hsl = { h: number; s: number; l: number }

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

/**
 * 从若干候选色里挑出在 `background` 上对比度最高的那个。
 *
 * 用途（D-23）：配色实验室的 5 个色槽本身就是用户选的颜色，标签文字直接写在
 * 色块上。用固定的 `--on-accent` 会在深色槽位上变成「深字压深底」——
 * 实测第 4、5 个槽位（两个深中性色）的标签几乎看不见。
 *
 * 这里不引入新颜色：候选值全部由调用方从现有 token 里给（通常是
 * `--on-accent` 与 `--canvas`），因此仍然没有游离于 5 色体系之外的色值。
 * 这是「按亮度分支」的又一个例子 —— 也是为什么派生必须留在 TS 里（D-22 第 3 节）。
 */
export function readableOn(background: string, candidates: readonly string[]): string {
  const bg = parseHex(background)
  const pool = [...candidates, toHex(WHITE), toHex(BLACK)]
  let best = pool[0] ?? background
  let bestRatio = -1
  for (const candidate of pool) {
    const ratio = contrastRatio(parseHex(candidate), bg)
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = candidate
    }
  }

  // 调用方给的候选（都是派生 token）优先：它们与整站风格一致。
  // 只有当它们全部达不到 4.5:1 时，才退到纯白/纯黑兜底 ——
  // 中间调底色（亮度 40~60%）上，--on-accent 与 --canvas 可能都不够，
  // 这在 D-23 的极端取值里实测到过（2.81 / 2.26 / 1.80）。
  // 纯白纯黑不参与配色决策，只作为「保证可读」的灰度端点，与派生层同一口径。
  if (bestRatio >= AA_TEXT) {
    const firstOk = pool.find((c) => contrastRatio(parseHex(c), bg) >= AA_TEXT)
    if (firstOk && candidates.includes(firstOk)) return firstOk
  }
  return best
}

/**
 * 两个十六进制色值的对比度。
 *
 * 供客户端预览直接用字符串算（不必先自己转 Rgb）。
 */
export function contrastRatioOfHex(foreground: string, background: string): number {
  return contrastRatio(parseHex(foreground), parseHex(background))
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
 * 与 `ensureContrast` 同义，但**自动选能达标的方向**。
 *
 * 为什么需要它（D-23）：`ensureContrast` 的 `direction` 原本是写死的（日间一律
 * `'darker'`、夜间一律 `'lighter'`），这在固定配色下永远成立。但配色实验室
 * 允许用户把**最深那个槽位拉亮**，此时日间正文若仍往黑里压还能达标，夜间正文
 * 往白里混却会撞在天花板上 —— 实测夜间 p5 亮度 90% 时正文只有 2.98:1、
 * 按钮文字 1.02:1，可读性保证彻底失效。
 *
 * 所以这里先试首选方向，不达标就反向再试，两边都比一遍取更优的那个。
 * 固定配色下首选方向永远先命中，结果与 `ensureContrast` 逐字节相同 ——
 * 这就是为什么加上它之后 384/384 等价性断言仍然全绿。
 */
function ensureContrastEither(
  color: Rgb,
  against: Rgb | Rgb[],
  target: number,
  preferred: 'lighter' | 'darker',
): Rgb {
  const direct = ensureContrast(color, against, target, preferred)
  const round = (c: Rgb) => parseHex(toHex(c))
  const refs = (Array.isArray(against) ? against : [against]).map(round)
  // 已经达标就不用再试反向，避免无谓地偏离配色本来的观感。
  if (refs.every((r) => contrastRatio(direct, r) >= target)) return direct

  const other = preferred === 'lighter' ? 'darker' : 'lighter'
  const flipped = ensureContrast(color, against, target, other)
  const worst = (c: Rgb) => Math.min(...refs.map((r) => contrastRatio(c, r)))
  return worst(flipped) > worst(direct) ? flipped : direct
}

/**
 * 保证颜色的相对亮度不高于 `max`，超出就往黑里压。
 *
 * 用于夜间画布（D-23）：用户把「最深槽位」拉亮后，`shade(p5, 0.34)` 会停在
 * 中间调，而中间调画布上浅色正文永远达不到 7:1。把画布本身钉到足够暗，
 * 可读性就不依赖用户把第 5 位放对。
 *
 * 已达标则原值返回，所以固定预设完全不受影响。
 */
function ensureMaxLuminance(color: Rgb, max: number): Rgb {
  // 未超限就**原值返回**（不做 round）：下游 surface/soft 都是在这个值上继续混色，
  // 中间多一道 hex 舍入会累积出 1 位色差，让「与旧实现完全相同」的等价性断言挂掉。
  if (luminance(color) <= max) return color

  const round = (c: Rgb) => parseHex(toHex(c))
  for (let t = 0.02; t <= 0.98; t += 0.02) {
    const candidate = round(mix(color, BLACK, t))
    if (luminance(candidate) <= max) return candidate
  }
  return round(mix(color, BLACK, 0.98))
}

/**
 * 按钮面：保证写在上面的文字达到 AA。
 *
 * 参考色卡里有些主色本身偏深（例如港湾卡的 `#0063bf`），直接当按钮面用会让
 * 深色文字对比度不足，所以要提亮到能读为止。
 *
 * 但 D-23 之后不能只会「提亮」：用户把 p5 拉亮时 `--on-accent` 会变成浅色，
 * 此时提亮按钮面只会更糊（实测夜间 p5 亮度 70% 时按钮文字只有 1.08:1）。
 * 所以交给 `ensureContrastEither` 自己判断该往哪边走。
 */
function capOn(color: Rgb, onAccent: Rgb): Rgb {
  return ensureContrastEither(color, onAccent, AA_TEXT, 'lighter')
}

/**
 * 五个源色。
 *
 * 原签名是 `config/palette.ts` 的 `PaletteColors` 五元组；这里刻意放宽成
 * `readonly string[]` 并在运行时校验长度 —— 因为客户端实验室的色值来自
 * `useState<string[]>`，类型上不可能是定长元组，但它同样必须有 5 个。
 */
function parseColors(colors: readonly string[]): [Rgb, Rgb, Rgb, Rgb, Rgb] {
  if (colors.length !== 5) {
    throw new Error(`[palette] 需要正好 5 个颜色，实际收到 ${colors.length} 个`)
  }
  return colors.map(parseHex) as [Rgb, Rgb, Rgb, Rgb, Rgb]
}

/** 派生结果的键值对，直接写进 CSS 自定义属性。 */
export type PaletteTokens = Record<string, string>

/**
 * 从 5 个颜色派生日间 token。
 *
 * 槽位语义见 `config/palette.ts`：
 * `p1` 主强调色、`p2` 次强调色、`p3` 第三强调色、`p4` 深中性 1、`p5` 最深。
 */
export function deriveLightTokens(colors: readonly string[]): PaletteTokens {
  const [p1, p2, p3, , p5] = parseColors(colors)

  // 画布：次强调色的极浅版，带一点色相，不是死白。
  const canvas = tint(p2, 0.95)
  const surface = tint(p2, 0.985)

  // 正文：从最深的槽位再压暗，然后强制达到 AAA 级对比（7:1）。
  // 同时对 canvas 与 surface 求解 —— 文字两个背景上都会出现。
  const ink = ensureContrastEither(shade(p5, 0.16), [canvas, surface], 7, 'darker')

  // 次要文字：以「正文与画布的中点」为起点，再强制达到 AA（4.5:1）。
  // 起点用中点而不是固定往白里混，是因为浅色卡上往白混会直接糊掉。
  const muted = ensureContrastEither(mix(ink, canvas, 0.45), [canvas, surface], AA_TEXT, 'darker')

  // 按钮面上的文字：从最深槽位压暗。
  //
  // 注意这里**不对 canvas 加约束**：--on-accent 的对照背景是按钮面，不是画布。
  // 我一开始顺手把它也绑到 [canvas, surface] 上，结果用户把 p5 拉亮时它被反转成浅色，
  // 夜间整套按钮面颜色全变（384/384 等价性断言当场挂了 48 项）。
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
export function deriveNightTokens(colors: readonly string[]): PaletteTokens {
  const [p1, p2, p3, , p5] = parseColors(colors)

  // 夜间画布 = 最深槽位再压暗。
  //
  // 但用户能在实验室里把 p5 拉亮，此时 shade(p5, 0.34) 会停在中间调，
  // 而中间调画布上--ink 永远达不到 7:1（实测 p5 亮度 70% 时只有 4.18）。
  // 所以这里加一道保障：**夜间画布的相对亮度不得高于 0.16**，
  // 超出就继续往黑里压。
  //
  // 0.16 不是拍的：6 套预设原本的夜间 canvas 亮度都在 0.02~0.06 之间，
  // 这条保障对它们完全不触发，所以 384/384 等价性断言仍然全绿。
  const canvas = ensureMaxLuminance(shade(p5, 0.34), 0.16)
  // surface 提亮 8% 后亮度会超过 canvas，而浅色正文在更亮的底上对比度更低。
  // 同样钉上限，否则 canvas 刚好处在 0.16 时 surface 会超到 0.19，7:1 就保不住（实测 6.01）。
  const surface = ensureMaxLuminance(tint(canvas, 0.08), 0.16)

  // 夜间 surface 比 canvas 亮（提亮 8%），所以最差情况是 surface，
  // 不是 canvas。两个都传进去，保证文字在哪一层上都达标。
  const ink = ensureContrastEither(tint(p2, 0.9), [canvas, surface], 7, 'lighter')
  const muted = ensureContrastEither(mix(canvas, ink, 0.6), [canvas, surface], AA_TEXT, 'lighter')

  // 与日间同理：--on-accent 的对照背景是按钮面，不对 canvas 加约束。
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
 * 生成整段配色 CSS（两条选择器：日间 `:root`、夜间 `:root[data-theme='night']`）。
 *
 * 构建期由根布局注入 `<head>`；运行时由配色实验室**替换同一份内容**写进
 * 一个带 id 的 `<style>`。两条路径产出完全一致，不存在第二种公式。
 *
 * 注意：`app/globals.css` 里**不再**定义任何颜色 token，颜色只由这里产出，
 * 因此不存在「两处定义谁覆盖谁」的顺序问题。
 */
export function buildPaletteCss(colors: readonly string[]): string {
  // 先校验一次，避免 5 元组以外的输入在这里静默产出半截 CSS。
  parseColors(colors)

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

// ---------------------------------------------------------------------------
// HSL 转换（决策 D-23：配色实验室的三个滑块）
// ---------------------------------------------------------------------------

/**
 * 十六进制 → HSL。
 *
 * 灰度色（`max === min`）的饱和度是 0，此时色相在数学上没有定义，按 0 返回。
 * 界面上因此需要一个「记住上次色相」的处理，否则把饱和度拖到 0 再拖回来，
 * 色相会跳回红色 —— 这件事由组件里的 HSL 状态承担，不在这个纯函数里做。
 */
export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = parseHex(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  if (delta === 0) return { h: 0, s: 0, l: l * 100 }

  const s = delta / (1 - Math.abs(2 * l - 1))

  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4

  h *= 60
  if (h < 0) h += 360

  return { h, s: s * 100, l: l * 100 }
}

/** HSL → 十六进制。色相会自动归一化到 0–360。 */
export function hslToHex(hsl: Hsl): string {
  const h = ((hsl.h % 360) + 360) % 360
  const s = Math.min(100, Math.max(0, hsl.s)) / 100
  const l = Math.min(100, Math.max(0, hsl.l)) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2

  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  const to255 = (v: number) => (v + m) * 255
  return toHex({ r: to255(rgb[0]), g: to255(rgb[1]), b: to255(rgb[2]) })
}
