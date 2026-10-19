# 站点外壳与导航模块设计

## 1. 模块职责

提供公开站点共享的 Header、Footer、主导航、移动导航、快捷入口和页面容器。负责全站可达性和导航一致性，不负责各页面具体内容。

消费页面：全部公开路由。后台使用独立外壳。

## 2. 信息架构

主导航保持少而稳定：

```text
首页 / 文章 / 时间轴 / 关于
```

次级入口：统计、标签/分类、RSS、GitHub、其他社交链接。快捷入口可在首页突出，不必全部挤入 Header。

## 3. 布局设计

### 3.1 Header

- 桌面：品牌左侧，主导航和主题开关右侧。
- 移动：品牌、主题开关和菜单按钮；导航进入抽屉/弹层。
- 可以 sticky，但不得遮挡锚点和占用过大视口。
- 品牌是首页链接并有可访问名称。

### 3.2 Footer

- 站点版权/年份、导航补充、RSS、社交链接、隐私说明。
- 不重复首页所有快捷按钮。
- 移动端分组纵向排列。

### 3.3 快捷入口

- 首页主要消费，也可在 404/空状态复用。
- 桌面 3 至 6 列，移动两列或自动换行。
- 每项包含图标、标题、可选描述；整项为一个链接。

## 4. 功能设计

- 当前主导航使用 `aria-current="page"`，详情页归属对应栏目。
- 外链明确 `target` 策略和安全 rel。
- 移动菜单打开时锁定背景滚动、管理焦点，Escape 关闭。
- 快捷链接按 `order` 排序，只渲染 enabled；外链图标非唯一提示。
- 提供 skip link 跳到 `<main id="main-content">`。
- 404 和错误页仍保留最小可用导航。

## 5. 配置与契约

```ts
type SiteNavigationConfig = {
  primary: Array<{ label: string; href: string; match?: string }>;
  quickLinks: Array<{
    title: string;
    href: string;
    icon?: IconKey;
    description?: string;
    order: number;
    external: boolean;
    enabled: boolean;
  }>;
  socialLinks: Array<{ label: string; href: string; icon?: IconKey }>;
};
```

MVP 使用类型化配置文件；后台设置启用后由 repository 提供相同契约。

## 6. 实现技术要点

- `app/(site)/layout.tsx` 渲染 Server Component 外壳。
- 当前导航匹配可由小型 Client Component 读取 pathname，或由布局/页面显式传 section，避免整 Header 客户端化。
- 移动抽屉使用原生 dialog 或经过验证的无障碍 Dialog 组件。
- Header 高度通过 CSS 变量提供给 `scroll-margin-top`。
- 快捷入口复用 `ToyButton`/`QuickLink`，不得嵌套多个交互根。
- 配置构建期校验 URL、重复 order 和必要字段。

## 7. 状态与异常

- 无 JS 时桌面导航、品牌、Footer 和基础链接仍可用。
- 移动菜单 JS 失败时可退化为 `<details>` 或展示核心链接。
- 图标缺失回退文字，不留空按钮。
- 快捷配置中无启用项时隐藏整个阵列。
- 当前路由未知时不错误标记 active。

## 8. 可访问性与性能

- 导航 landmark 有区分名称。
- 菜单按钮暴露 `aria-expanded`、`aria-controls`。
- 抽屉焦点回归触发器；Tab 不进入背景。
- Header 不加载大型动画；图标内联或按需加载。
- 链接预取只用于高价值内部路由，避免大量外链/列表预取。

## 9. 验收标准

- 所有公开页面共享一致 Header/Footer，并能返回主要栏目。
- 当前栏目、移动菜单、主题开关和 skip link 工作正常。
- 快捷入口配置可增删排序且移动端无溢出。
- 外链安全属性和键盘焦点正确。
