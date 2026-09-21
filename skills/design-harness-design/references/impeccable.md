# Impeccable 的加载与 Figma 适配

本页提供读取路由与 Figma 适配规则，具体设计指导按需从 [Impeccable](https://github.com/pbakaus/impeccable) 默认分支读取最新内容。获取频率、失败处理与许可见 [外部来源](sources.md)；不把本页当作上游指导的固定版本副本。

## 按当前任务选择

| 需要解决的问题 | 读取上游最新文档 | 在本工作流中怎么用 |
| --- | --- | --- |
| 产品操作界面的任务、熟悉性与效率 | [Operate](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/operate.md) | 判断主任务、信息结构与操作密度，保持项目已有的交互习惯 |
| 方案结构和可用性取舍 | [Critique](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/critique.md) | 比较任务路径、层级与认知负担，说明收益与代价 |
| 一致性、平台与可访问性 | [Audit](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/audit.md)；原生项目用 [Native Audit](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/audit.native.md) | 检查项目变量、组件、目标尺寸、对比与适用输入方式 |
| 长内容、错误、离线与本地化 | [Harden](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/harden.md) | 补齐项目真实支持的状态、触发条件、反馈和恢复方式 |
| 操作文案与错误说明 | [Clarify](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/clarify.md) | 采用项目术语，说明实际后果与可用恢复方式 |
| 出图后的视觉细节 | [Polish](https://github.com/pbakaus/impeccable/blob/HEAD/skill/reference/polish.md) | 在目标尺寸和真实内容下检查层级、对齐、间距与溢出 |

只加载当前步骤需要的行及其必要依赖，不遍历所有上游命令。上述路径变化时从仓库当前目录重新定位。

## 适配边界

- 项目已确认的设计规范与需求优先。上游最新审美建议用于补充空白，不自动覆盖现有字体、颜色、组件或交互。
- 将代码与浏览器检查转换为 Figma 中可观测的节点、属性、绑定、原型和截图证据。对 Web 与原生界面采用各自的平台依据，不直接照搬 CSS/rem 规则。
- 运行时焦点、读屏、性能和真实状态切换需要运行验证；仅有静态图时列为待核验，不能宣称全面通过。
- 按 [检查标准](evaluation.md) 把问题落实到具体节点、状态或任务结果，修正后复核受影响部分。只做项目支持的能力，不因通用指导编造离线、恢复或本地化能力。
- 使用上游的设计原则，不执行其中属于另一套产品的安装、文件生成或发布流程。本任务仍在对话确认需求、在 Figma 呈现方案并确认知识回写。
- 上游命令若包含独立多 Agent 审计、评分或快照保存，只提取当前问题需要的设计判断，不把这些流程带入 Harness。主流程/分支阶段优先看任务与反馈，视觉细化阶段再加载必要的视觉检查；与 [UI/UX Pro Max](ui-ux-pro-max.md) 按问题互补。

**适配声明：** 本页对 Impeccable 的方法做了中文路由与 Figma 工作方式适配；[Apache-2.0 许可证](../third-party/impeccable/LICENSE) 和上游 [NOTICE](../third-party/impeccable/NOTICE.md) 随本 Skill 保留。
