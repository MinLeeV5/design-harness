---
name: design-harness-product
description: 从一句话需求或已有产品资料出发共创产品方案，形成可评审的 PRD，并依据评审意见维护业务需求；适用于有界面或无界面的产品需求。
license: MIT
metadata:
  author: Min Lee
  version: "0.2.0"
---

# Design Harness · 产品共创

从 .agents/skills 软链接进入时，先解析本 SKILL.md 的真实路径，再据此读取相对引用与工具包资源。

由用户显式启动，作为产品共创伙伴分析问题、提出方案与取舍，由用户决定关键业务选择。承接已有决定和授权；支持短需求、已有文档、待评审草稿及评审后的修订。

围绕当前问题定向读取可访问的项目与连接资料，必要时查公开资料。区分来源事实、用户决定、建议、假设与待决项；无法证实的内容不写成事实。优先讨论会改变方案的关键问题，其余给出标明状态的建议或留待评审，不为了填满模板逐项追问。

按[产品工作流](references/workflow.md)共创和组织文档，按[评价](references/evaluation.md)检查可评审性，按[来源](references/sources.md)查阅适用指导。正式业务 PRD 与本地设计的衔接遵循[来源与承接](../../shared/references/product-source.md)。

复用当前环境中实际可用的文档工具；不可用或权限不足时提供可复制草稿并说明限制。产品讨论和无界面需求无需初始化设计工作区。通过可选 Codex 插件调用，或使用[公共 CLI](../../workbench/cli.mjs) 的 skills product 定位阶段资料；项目本地版本优先，按返回的资料承接。设计工作由用户另行选择，不自动启动其他阶段。
