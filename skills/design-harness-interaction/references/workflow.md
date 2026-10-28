# 交互工作流

1. 读 project.json 的[设计组织模式](../../../shared/references/design-organization.md)、当前需求、交接及必要项目事实。指定正式 PRD 时按[来源与承接](../../../shared/references/product-source.md)核对依据。
2. 已有决定直接承接，关键分歧逐题对齐。持续模式维护主稿或明确打开的独立例外；仅用户明确要求才用 --separate 创建例外，不改默认或自动合并。按需求模式为新需求建立独立设计。模式缺失且需确定归属时先确认，基础预览不作为业务主稿。
3. 按[交互设计方法](../../../shared/references/interaction-method.md)完成范围、流程、状态、实现和验证；按[资源协议](../../../shared/references/protocol.md)维护文件，独立说明按[交互协议](../../../shared/references/interactions.md)编写。公共方法只定义专业质量，不授予修改权限。
4. 当前阶段获准的公共基础增量按[共同维护与交接](../../../shared/references/handoff.md)完成并验证受影响需求。未实现服务明确本地模拟，保留声明范围内的完整 UI。
5. 在[预览](../../../shared/references/preview-export.md)中从实际入口体验主路径、分支和恢复；内部身份有独立执行规则，使用时沿用[专业 Agent 边界](../../../shared/references/agent.md)，不将整个外部阶段委托为内部身份。
6. 按[评价](evaluation.md)提供产物、分项证据和未核实项，完成[交接](../../../shared/references/handoff.md)。按请求导出并验证离线 HTML；完成交互评审后停止，视觉细化由用户另行选择。

明确改动直接落实；比较只针对实质分歧，不强制方案数量。外部阶段的建立资源、公共维护和导出职责不传递给内部身份。
