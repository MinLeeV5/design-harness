---
name: design-harness-init
description: 在项目仓库建立独立设计工作区，沉淀产品上下文、规则、Token、组件与资源，形成可供需求复用的设计基础。
license: MIT
metadata:
  author: Min Lee
  version: "0.2.0"
---

# Design Harness · 初始化

由用户显式启动本阶段，承接当前范围、授权与决定。设计交付独立于产品工程，知识保存到项目仓库的 design-harness/，不依赖 Figma。

工作台由完整插件固定提供；项目只维护业务资源。页面采用 json-render Spec，Catalog／Registry 注册项目自定义 React 组件；实例属性写回 Spec，组件内部实现由 Agent 修改。公共命令使用[插件 CLI](../../workbench/cli.mjs)，插件目录为本文件所在目录的 ../..。

完整 UI 交付须覆盖声明范围内的产品壳层、组件与状态，按最高保真要求核对；独立于工程复用不降低设计质量。先读[交付保真](../../shared/references/fidelity.md)，再读[工作流](references/workflow.md)。建立工作区读[模板职责](../../shared/references/workspace.md)，编写文件读[协议](../../shared/references/protocol.md)，
独立交互文档与页面同步读[交互协议](../../shared/references/interactions.md)。编号说明、精确点选、统一 Agent 讨论与视觉调整、完整会话过程、检查与按需 HTML 导出读[操作](../../shared/references/preview-export.md)，恢复读[交接](../../shared/references/handoff.md)。
完成前按[评价](references/evaluation.md)核对真实产物；外部指导按[来源](references/sources.md)定向读取。
