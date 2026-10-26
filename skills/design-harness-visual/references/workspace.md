# 本地工作区

按需读取：[协议](protocol.md)、[预览与导出](preview-export.md)、[恢复与确认](handoff.md)。

## 三层职责

- 插件模板：评审工作台、隔离预览、页面注册、说明定位、场景、候选比较、局部调参、导出工具。
- 项目基础：foundation/ 中的设计意图、Token、组件、布局模式、图形资源及来源；由 Init 与获准的回写维护。
- 独立需求：requirements/<id>/ 中的说明、页面、场景、候选、交接与基础快照。UI 是设计参考，不导入研发业务模块。

评审以满幅预览为中心，说明、Live 和反馈按需从浮动面板打开，不常驻占用画布；本地与固定 HTML 使用同一工作台。

初始化助手：[harness.mjs](../scripts/harness.mjs)。它复制完整的 [React 工作区模板](../assets/workspace/README.md)，每个 Skill 单独复制后仍可运行：

    node <skill目录>/scripts/harness.mjs init --project <项目目录>
    npm --prefix <项目目录>/design-harness ci

初始化拒绝覆盖已有目录。使用 --example 才创建通用示例；示例不属于项目事实，也不表示基础已确认。
Node.js 22+；工作区依赖安装在自身目录，不改业务 package.json、路由和构建。

工作区不存在时，在用户本次任务已覆盖的范围内建立必要脚手架。现有工作区先读 workspace.json、foundation/design.md 和当前需求交接，不重建。
设计参考可以来自已有代码、截图、Pencil 或其他用户指定来源；Figma 只在用户要求时使用，不是初始化或预览依赖。
新项目没有存量规范时共创最小基础，以实际可见结果确认；不能把模板默认值称作品牌规范。

## 创建与升级

    npm --prefix <工作区> run new -- <需求ID> --title <需求名称>
    npm --prefix <工作区> run upgrade -- <原需求ID> <新需求ID>

需求创建时复制公共 foundation；React 导入需求内的 foundation/。公共更新只影响新需求。
显式升级生成独立需求，保留原稿和固定交付。升级后的设计仍需评审，版本号不等于用户验收。
