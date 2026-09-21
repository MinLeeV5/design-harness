# Design 的外部来源

## 通用设计指导

[pbakaus/impeccable](https://github.com/pbakaus/impeccable) 提供通用设计与评价指导，作者 Paul Bakaus 与贡献者。按 [加载与适配](impeccable.md) 选择当前任务需要的文档。

每次任务首次需要某份指导时，使用可用的网页或仓库读取工具获取默认分支的最新内容；不固定 tag、commit，也不维护版本锁或分发上游指导快照。`HEAD` 链接用于跟随默认分支；若路径变化，从上游 README 或目录查找替代路径。同一任务可复用已读内容，用户要求刷新时重新读取。

实际使用的来源链接和读取日期保留在对话即可。网络不可用时明确“未取得最新上游指导”，继续项目规范和本 Skill 的检查能够支持的工作；不要把本地适配规则称为最新 Impeccable。

上游文本提供设计参考，不替代本 Skill 的访谈、Figma 交付与确认回写流程，也不要求运行上游 CLI、hooks 或安装脚本。

## 设计语言描述

- [google-labs-code/design.md](https://github.com/google-labs-code/design.md)：设计语言描述的结构与写法。编写或修订相关正文时，读取默认分支的 [格式说明](https://github.com/google-labs-code/design.md/blob/HEAD/docs/spec.md) 与 [写作理念](https://github.com/google-labs-code/design.md/blob/HEAD/PHILOSOPHY.md)，把视觉意图与真实 token/组件关联。
- 本 Skill 的 [Figma 适配](design-description.md) 与 [内容蓝图](../assets/design-description.txt) 保留 [Apache-2.0 许可证](../third-party/design-md/LICENSE) 和 [来源/修改声明](../third-party/design-md/NOTICE.md)。沿用上方按需获取方式；维护适配时核对上游最新许可。既有项目设计语言优先，旧描述不会因上游变化自动失效。

## 访谈方法

用户提供的 harness-cli brainstorming 与 grilling 是逐题访谈、推荐理由和成熟度判断的思路来源。[访谈机制](interview.md) 为本 Skill 独立编写，不复制或分发外部 Skill，也不要求安装它们。需要重新研究这些方法时，读取用户当前提供的来源，不要求特定旧版本。

## 许可与适配

本 Skill 的原创部分采用 [MIT 许可证](../LICENSE)。DESIGN.md 适配的许可见上方来源。Impeccable 相关内容按 Apache-2.0 适配，随附其 [LICENSE](../third-party/impeccable/LICENSE) 与 [NOTICE](../third-party/impeccable/NOTICE.md)。适配包括中文表达、项目规范优先、平台与 Figma 证据边界；不代表执行过上游工具。

维护适配内容或复制新的上游内容时，核对上游当前 LICENSE 与 NOTICE，保留适用声明。许可文件用于说明随包内容的来源，不锁定运行时参考版本。NOTICE 中提及的平台参考正文未随包分发。
