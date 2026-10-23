import 'server-only'

/**
 * 5 色配色体系 —— 服务端入口（决策 D-22 / D-23）。
 *
 * **这个文件只做两件事**：加上 `server-only` 守卫、把 `palette-core` 的纯函数
 * 转出给服务端消费。真正的派生公式全部在 `lib/theme/palette-core.ts` 里。
 *
 * ## 为什么要这样拆
 *
 * 决策 D-22 把派生层写成 server-only，理由是「颜色必须在构建期算完并注入，
 * 保住根布局的静态渲染（REQ-NFR-001）」。
 *
 * 决策 D-23 要在首页做配色实验室，让用户拖滑块**实时**看到整套配色变化。
 * 那就必须能算，两个选择：
 *
 * - 在客户端复制一份公式 → 运行时预览与构建产物必然漂移，两份公式迟早对不上。
 * - 把公式收进一个客户端安全的文件 → 服务端与客户端跑同一份代码。
 *
 * 选了后者。但**静态渲染的保证不能丢**，所以：
 *
 * - `palette-core.ts` 不含 `server-only`，可在两端运行，且没有任何副作用
 *   （不读 `process.env`、不碰 DOM、不做 I/O）。
 * - 这个文件保留 `server-only` 守卫，`app/layout.tsx` 仍然只从这里 import。
 *   一旦有人误在客户端组件里 import 它，构建期就会报错，而不是悄悄把整个
 *   派生层打进浏览器 bundle。
 *
 * 换句话说：**公式共用，但「在构建期决定站点配色」这条路径仍然是服务端专属的。**
 */

export {
  buildPaletteCss,
  contrastRatio,
  contrastRatioOfHex,
  deriveLightTokens,
  deriveNightTokens,
  hexToHsl,
  hslToHex,
  readableOn,
} from '@/lib/theme/palette-core'

export type { Hsl, PaletteTokens } from '@/lib/theme/palette-core'
