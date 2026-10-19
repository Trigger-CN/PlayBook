# 视觉主题系统设计

## 1. 模块职责

定义全站日间/晚间主题、色彩角色、排版、网格背景、立体按钮、可按压卡片、焦点和动效规则。消费方包括全部公开页面和后台基础控件。

本模块不负责页面内容编排；立体按钮细节以 `TECHNICAL_ARCHITECTURE.md` 12.3 为实现基线。

## 2. 设计原则

- 扁平卡通矢量，而非玻璃拟态或写实材质。
- 深度来自明亮按钮面、深色实体底座和明确位移。
- 高饱和 Coral/Pink/Mint/Sky/Lilac 与 Cream、暖黑共同构成多角色色板。
- 夜间主题是“夜晚玩具盒”，不是通用深蓝 SaaS。
- 内容阅读区克制，操作区域才强调按压反馈。
- 小操作按钮与大 CTA 使用同一结构，不退化成普通胶囊。

## 3. Token 设计

### 3.1 颜色

每个交互色定义 `cap/base` 色对：

```text
canvas / ink / muted / surface / soft / line / grid / focus
coral / coral-base
pink / pink-base
cream / cream-base
mint / mint-base
sky / sky-base
lilac / lilac-base
```

CSS 变量放在 `:root` 和 `[data-theme="night"]`。组件只引用语义 token，禁止业务代码写随机十六进制色。

### 3.2 尺寸与形状

- 内容容器：最大 1180px。
- 控件圆角：小 13px、默认 16px；卡片 16px 至 20px，页面工具区不做浮动卡。
- 立体按钮：默认面高 52px/底座 8px；小按钮 42px/7px。
- 触控目标至少 44px 等效尺寸。
- 文字间距固定，不使用负 letter-spacing，也不随 viewport 连续缩放。

### 3.3 动效

- 按钮状态 80ms 至 150ms。
- 卡片 hover/active 100ms 至 180ms。
- 页面/装饰动效最长应保持轻量，不妨碍阅读。
- 只动画 transform、opacity 和有限 filter；避免尺寸属性和大面积模糊阴影。

## 4. 核心组件

- `ToyButton`：外层底座 + 内层按钮面，支持 button/link 语义。
- `ToyCard`：文章/时间轴可点击卡，实体底座和按压位移。
- `TagChip`：筛选状态使用色对和 `aria-pressed`，不永久停留物理按下位置。
- `ThemeToggle`：卡通滑块，`aria-pressed` 和本地持久化。
- `StatBlock`：几何块面与辅助色，不嵌套操作卡。
- `DecorativeBackground`：网格、圆点、贴纸，仅装饰时隐藏于可访问树。

组件 variant 使用 class-variance-authority 或明确映射，业务层不拼接任意 token 名称。

## 5. 主题切换流程

1. 服务端读取 theme cookie（如采用）并在 `<html data-theme>` 输出初始值。
2. 无保存值时参考 `prefers-color-scheme`。
3. 用户切换后立即更新 `data-theme`，同步 cookie/localStorage。
4. 后续访问服务端输出正确主题，减少闪烁。
5. 系统主题变化仅在用户未手动选择时跟随。

若只使用 localStorage，需在 head 中执行极小的同步初始化脚本并避免 CSP 违规；正式实现更推荐 cookie + 客户端同步。

## 6. 状态规范

- hover 只作为增强，触屏不依赖 hover。
- active 表达瞬时按下；selected 使用 aria 状态和颜色。
- focus-visible 使用 4px focus token 和 offset。
- disabled 不触发 hover/active；原生控件优先 `disabled`。
- loading 保持原尺寸并设置 `aria-busy`。
- error/success 不只靠红绿颜色，还包含图标和文本。

## 7. 实现技术要点

- `app/globals.css` 定义主题 token、reset、focus 和 reduced-motion。
- `components/ui/*` 封装基础视觉组件；页面只组合，不重复核心 CSS。
- Tailwind 方案用 CSS variables 映射到 utility，保留动态主题能力。
- SSR 初始主题必须与 hydration 一致，避免 React mismatch。
- 自定义图标优先 SVG/Rive；常规工具图标使用 lucide-react。
- 组件 Storybook 非 MVP 必需，但至少建立独立示例页/测试覆盖全部状态。

## 8. 可访问性与性能

- 两套主题都检查正文、控件文字、焦点和禁用状态对比度。
- `prefers-reduced-motion` 取消 transition 和循环装饰动画。
- 纯装饰 SVG `aria-hidden`; 信息图有替代文本。
- Rive/Lottie 懒加载并提供静态 poster；不可阻塞 LCP。
- CSS token 和基础组件不依赖大型运行时动画库完成按压。

## 9. 验收标准

- 日间/晚间即时切换、刷新保持、无明显闪烁。
- ToyButton/ToyCard 具备 default、hover、active、disabled、focus-visible。
- 按钮面与底座同宽，390px 小按钮不溢出。
- 主题覆盖背景、正文、卡片、统计、时间轴、评论和后台控件。
- reduced-motion 下无非必要动画且状态仍清晰。
