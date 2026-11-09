---
name: design-harness-visual
description: 在已有 json-render＋React 需求中细化高保真、多尺寸视觉与候选，并完成获准的公共基础维护、交接与按需离线交付。
license: MIT
metadata:
  author: Min Lee
  version: "0.2.0"
---

# Design Harness · 视觉设计

由用户显式启动本阶段，承接当前范围、授权与决定。设计交付独立于产品工程，知识保存到项目仓库的 design-harness/，不依赖 Figma。

用于已有需求的高保真对齐、多尺寸和候选细化；承接已确认行为，同轮完成获准的公共增量、验证与交接，按请求导出，无需另启回写阶段。

先读取项目已确认的[设计组织模式](../../shared/references/design-organization.md)，在对应产品主稿或独立设计内细化。局部候选比较沿用当前设计，用户明确要求的单次拆分不改变项目默认模式。

在工作台显式选择“视觉设计”身份时，按需采用共同专业方法与质量标准，使用独立内部身份入口；运行方式与能力边界见[专业 Agent](../../shared/references/agent.md)。

工作台由完整工具包提供，支持宿主项目开发依赖、全局 CLI 及可选 Codex 插件；设计资源目录只维护业务资源。页面采用 json-render Spec，Catalog／Registry 注册项目自定义 React 组件；实例属性写回 Spec，组件内部实现由 Agent 修改。公共命令使用[公共 CLI](../../workbench/cli.mjs)，工具包目录为本文件所在目录的 ../..。入口优先使用项目本地版本；先通过 skills 定位并按该版本的阶段资料与公共指导承接。

完整 UI 交付须覆盖声明范围内的产品壳层、组件与状态，按最高保真要求核对；独立于工程复用不降低设计质量。先读[交付保真](../../shared/references/fidelity.md)，再读[工作流](references/workflow.md)。建立工作区读[模板职责](../../shared/references/workspace.md)，编写文件读[协议](../../shared/references/protocol.md)，
独立交互文档与页面同步读[交互协议](../../shared/references/interactions.md)。编号说明、精确点选、统一 Agent 讨论与视觉调整、完整会话过程、检查与按需 HTML 导出读[操作](../../shared/references/preview-export.md)，过程维护、公共基础更新、完成与恢复读[共同维护与交接](../../shared/references/handoff.md)。
完成前按[评价](references/evaluation.md)核对真实产物；外部指导按[来源](references/sources.md)定向读取。
