/**
 * 5 色配色体系 —— 全站颜色的唯一来源（决策 D-22）。
 *
 * ## 只有这里可以写颜色值
 *
 * 站内所有颜色都由下面这 5 个值派生：`app/globals.css` 用 `color-mix()` 从它们
 * 算出 canvas / ink / muted / line / surface / soft / shell / focus / shadow，
 * 以及 coral / pink / cream / mint / sky / lilac 六个语义色对。
 * 组件只引用语义 token，**任何组件里都不允许再出现十六进制色值**。
 *
 * ## 为什么是 5 个而不是更多
 *
 * 用户提供的 5 张参考色卡（`img/Snipaste_2026-10-23_*.png`）结构完全一致：
 * 前 3 位是饱和强调色，第 4、5 位是最深的两个中性色。所以 5 个槽位的语义是固定的：
 *
 * | 槽位 | 角色 | 派生去向 |
 * | --- | --- | --- |
 * | `--palette-1` | 主强调色 | coral（主 CTA）、pink / lilac（提亮或混合） |
 * | `--palette-2` | 次强调色 | mint、cream（提亮成浅底） |
 * | `--palette-3` | 第三强调色 | sky、focus 焦点环 |
 * | `--palette-4` | 深中性色 1 | 预留：卡片底座的深端（当前由 5 号派生，保留槽位以对齐色卡） |
 * | `--palette-5` | 深中性色 2（最深） | canvas / ink / muted / line / grid / surface / shadow |
 *
 * **约束**：请把最深的颜色放在第 5 位。文字色 `--ink` 由它压暗得到，
 * 若第 5 位过浅，正文对比度会不足。
 *
 * ## 怎么改成自己的 5 个颜色
 *
 * 三种方式，任选其一：
 *
 * 1. 直接改 `customColors`（最简单）——填 5 个十六进制值，全站立刻跟随。
 * 2. 改 `activePaletteId` 换一套预设。
 * 3. 设环境变量 `NEXT_PUBLIC_PALETTE=<预设 id>`，不改代码即可切换（构建时读取）。
 *
 * 三种方式都在构建期解析，因此根布局仍是静态输出，不违背 REQ-NFR-001。
 */

export type PaletteColors = readonly [
  /** 1 · 主强调色 */
  string,
  /** 2 · 次强调色 */
  string,
  /** 3 · 第三强调色 */
  string,
  /** 4 · 深中性色 1 */
  string,
  /** 5 · 深中性色 2（最深，正文色由它压暗得到） */
  string,
]

export type Palette = {
  /** 展示用名称。 */
  name: string
  /** 5 个颜色，顺序与参考色卡一致：3 个强调色 + 2 个深中性色。 */
  colors: PaletteColors
}

/**
 * 预设配色。
 *
 * `classic` 是项目原有的视觉基线（珊瑚 + 薄荷 + 天空），默认选中，
 * 保证引入本体系后站点外观不发生回归。
 * 其余 5 套直接取自用户提供的参考色卡，顺序与色卡逐位对应。
 */
export const palettes = {
  classic: {
    name: '玩具盒（项目原有基线）',
    colors: ['#ff656c', '#82e2bf', '#8dd1ff', '#3a2430', '#211522'],
  },
  tide: {
    name: '潮汐（色卡 1）',
    colors: ['#64f1e8', '#f2ac63', '#f27a63', '#667372', '#736d66'],
  },
  harbor: {
    name: '港湾（色卡 2）',
    colors: ['#0063bf', '#28bfb8', '#bfad5a', '#bf7600', '#19436b'],
  },
  sunrise: {
    name: '日出（色卡 3）',
    colors: ['#24bbec', '#eda724', '#ed6724', '#47646e', '#6e6047'],
  },
  meadow: {
    name: '草甸（色卡 4）',
    colors: ['#59ddaf', '#de8959', '#de5b59', '#555e5b', '#5e5855'],
  },
  ember: {
    name: '余烬（色卡 5）',
    colors: ['#f8105e', '#c43363', '#91435d', '#5e3e49', '#332c2e'],
  },
} as const satisfies Record<string, Palette>

export type PaletteId = keyof typeof palettes

export const PALETTE_IDS = Object.keys(palettes) as PaletteId[]

/**
 * 自定义 5 色覆盖。填了它，`activePaletteId` 与环境变量都会被忽略。
 *
 * 例如：
 * ```ts
 * export const customColors: PaletteColors | null = ['#ff7a45', '#ffd166', '#06d6a0', '#3d314a', '#1b1220']
 * ```
 */
export const customColors: PaletteColors | null = null

/** 默认预设。被 `customColors` 或环境变量覆盖时失效。 */
export const DEFAULT_PALETTE_ID: PaletteId = 'classic'

function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value)
}

/**
 * 解析当前生效的 5 个颜色。
 *
 * 优先级：`customColors` > `NEXT_PUBLIC_PALETTE` 环境变量 > `DEFAULT_PALETTE_ID`。
 * 环境变量写错时静默回落到默认预设 —— 配色配错不应该让整站构建失败。
 */
export function resolvePaletteColors(): PaletteColors {
  if (customColors) return customColors

  const fromEnv = process.env.NEXT_PUBLIC_PALETTE
  if (isPaletteId(fromEnv)) return palettes[fromEnv].colors

  return palettes[DEFAULT_PALETTE_ID].colors
}

/**
 * 生成注入到 `<html>` 的 CSS 自定义属性。
 *
 * 用 inline style 而不是把值拼进 CSS 文件，是为了让 5 个颜色保持「运行时也是变量」：
 * 在浏览器里改 `--palette-1` 就能立刻看到整套配色变化，不需要重新构建。
 */
export function paletteCssVars(colors: PaletteColors): Record<string, string> {
  return {
    '--palette-1': colors[0],
    '--palette-2': colors[1],
    '--palette-3': colors[2],
    '--palette-4': colors[3],
    '--palette-5': colors[4],
  }
}
