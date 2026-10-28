/**
 * Markdown 代码块的 Shiki 主题（决策 D-34）。
 *
 * ## 为什么不用 Shiki 内置主题
 *
 * 内置主题（包括 `github-light` / `github-dark`）的颜色是**固定十六进制**：
 * Shiki 在构建期把它们内联进每个 `<span style="color:#xxxxxx">`。也就是说
 * `data-theme` 切换对代码高亮**完全无效** —— 夜间模式下，深色字压在深色底上。
 *
 * 实测（6 套预设 × 日夜 × 19 个 token）：228 项里 150 项不达标，夜间 19/19 全挂，
 * 最差 1.01:1。日间也有 6 项不达标（`variable` 是 `#e36209`，在 ember 的浅底上只有 2.74）。
 *
 * ## 解法：把颜色从构建期搬到运行期
 *
 * 这里所有颜色都写成 `var(--code-*)`。Shiki **不校验颜色格式**，会把它原样
 * 输出（已用探针实测确认，输出里零个硬编码颜色）。而 `--code-*` 由
 * `lib/theme/palette-core.ts` 的派生层按日间/夜间各生成一套，
 * 分别挂在 `:root` 与 `:root[data-theme='night']` 上。
 *
 * 结果：**一份主题吃两套变量**，切主题时代码块自动跟着变，不需要第二份主题、
 * 不需要客户端重渲染。这是本文件存在的全部理由。
 *
 * ## `type` 字段为什么是 'dark'
 *
 * `type` 影响 Shiki 的默认回退色（`editor.foreground` / `editor.background`）。
 * 颜色我们全部显式给出，所以它只是一个占位；选 'dark' 是因为它让 Shiki 在
 * 未匹配到 token 时**不注入额外样式**，真正生效的是 `<pre>` 上继承来的 `--ink`。
 *
 * ## 与 `--code-*` 的契约
 *
 * 八个变量见 `deriveCodeTokens()`：plain / comment / keyword / string / number /
 * entity / type / name。每一色都对 `--soft` 求解过 AA（代码块的底色是 `--soft`），
 * 因此这里不需要、也不允许再写任何具体色值。
 */

/** 8 个 `--code-*` 变量名，派生层与主题共用同一份清单。 */
export const CODE_TOKEN_KEYS = [
  '--code-plain',
  '--code-comment',
  '--code-keyword',
  '--code-string',
  '--code-number',
  '--code-entity',
  '--code-type',
  '--code-name',
] as const

/** Shiki 主题对象的最小结构描述（只用到这几个字段，不引 shiki 的类型）。 */
export type ShikiTheme = {
  name: string
  type: 'light' | 'dark'
  colors: Record<string, string>
  tokenColors: Array<{
    scope: string | string[]
    settings: { foreground?: string; fontStyle?: string }
  }>
}

const code = (key: (typeof CODE_TOKEN_KEYS)[number]) => `var(${key})`

/**
 * 代码高亮主题。
 *
 * 作用域刻意写得比内置主题**更宽**：只覆盖常见 scope 会导致大量 token 落到
 * 「没有匹配」的默认分支，而默认分支的默认色正是上一版翻车的原因。这里把
 * TextMate 里最常见的家族整体收进来，宁可让某些少见语法串色，也不要出现
 * 一个不受 `--code-*` 管辖的漏网 token。
 */
export const PLAYBOOK_CODE_THEME: ShikiTheme = {
  name: 'playbook-code',
  type: 'dark',
  colors: {
    'editor.foreground': code('--code-plain'),
    'editor.background': 'transparent',
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment', 'comment.block', 'comment.line'],
      settings: { foreground: code('--code-comment'), fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'keyword.operator.new',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.other',
        'punctuation.definition.keyword',
      ],
      settings: { foreground: code('--code-keyword'), fontStyle: 'bold' },
    },
    {
      scope: [
        'string',
        'string.quoted',
        'string.template',
        'punctuation.definition.string',
        'string punctuation.section.embedded source',
        'markup.inline.raw',
        'markup.raw',
      ],
      settings: { foreground: code('--code-string') },
    },
    {
      scope: [
        'constant',
        'constant.numeric',
        'constant.language',
        'constant.character',
        'constant.other',
        'entity.name.constant',
        'variable.other.constant',
        'variable.other.enummember',
        'variable.language',
        'support.constant',
        'support.variable',
        'meta.preprocessor',
      ],
      settings: { foreground: code('--code-number') },
    },
    {
      scope: [
        'entity',
        'entity.name',
        'entity.name.function',
        'entity.name.function.method',
        'support.function',
        'meta.function-call',
        'meta.method-call',
        'variable.function',
      ],
      settings: { foreground: code('--code-entity') },
    },
    {
      scope: [
        'entity.name.tag',
        'entity.name.type',
        'entity.name.class',
        'entity.other.inherited-class',
        'support.type',
        'support.class',
        'type',
        'meta.type',
        'keyword.type',
      ],
      settings: { foreground: code('--code-type') },
    },
    {
      scope: [
        'variable',
        'variable.other',
        'variable.parameter',
        'variable.parameter.function',
        'variable.other.property',
        'variable.other.object',
        'support.variable.property',
        'meta.property-name',
        'support',
        'meta.object-literal.key',
        'punctuation.separator.key-value',
        'meta.definition.variable',
        'meta.at-rule',
      ],
      settings: { foreground: code('--code-name') },
    },
    {
      scope: [
        'punctuation',
        'meta.brace',
        'punctuation.separator',
        'punctuation.terminator',
        'punctuation.definition',
        'keyword.operator',
        'keyword.operator.assignment',
        'keyword.operator.arithmetic',
        'keyword.operator.comparison',
        'keyword.operator.logical',
        'meta.delimiter',
        'source.css punctuation',
      ],
      settings: { foreground: code('--code-plain') },
    },
    {
      scope: ['invalid', 'invalid.illegal', 'invalid.broken', 'invalid.deprecated'],
      settings: { foreground: code('--code-keyword'), fontStyle: 'underline' },
    },
    {
      scope: ['markup.heading', 'markup.heading entity.name', 'markup.bold', 'markup.italic'],
      settings: { foreground: code('--code-plain'), fontStyle: 'bold' },
    },
    {
      scope: ['markup.quote', 'markup.list', 'punctuation.definition.list.begin.markdown'],
      settings: { foreground: code('--code-comment') },
    },
    {
      scope: ['markup.inserted', 'markup.deleted', 'markup.changed'],
      settings: { foreground: code('--code-comment') },
    },
  ],
}
