# Init 的外部来源

需要外部架构、设计语言或视觉资产指导时才查阅对应部分；普通项目盘点直接按本 Skill 的工作流和项目事实推进。

## 架构参考

- [设计 Harness 文章](https://rexandduckie.substack.com/p/stop-chasing-design-tools-start-building)：Context / Skills / Workflow / Evaluation / Knowledge 的概念背景，未复制文章正文。
- [BilLogic/harness-designing-plugin](https://github.com/BilLogic/harness-designing-plugin)：架构与评价思路的参考。需要时从仓库当前默认分支的 README 定位相关说明；本 Skill 独立实现 Figma 初始化，不分发或执行上游工作流与脚本。随附其 [MIT 许可证](../third-party/harness-designing-plugin/LICENSE)。

## 设计语言描述

- [google-labs-code/design.md](https://github.com/google-labs-code/design.md)：设计语言的结构化描述方式，结合精确 token、视觉意图、用途与边界。首次编写或修订相关描述时，读取默认分支的 [格式说明](https://github.com/google-labs-code/design.md/blob/HEAD/docs/spec.md) 与 [写作理念](https://github.com/google-labs-code/design.md/blob/HEAD/PHILOSOPHY.md)。
- 本 Skill 的 [Figma 适配](design-description.md) 和 [内容蓝图](../assets/design-description.txt) 按 Apache-2.0 保留 [许可证](../third-party/design-md/LICENSE) 与 [来源/修改声明](../third-party/design-md/NOTICE.md)。使用项目真实资产，不复制示例品牌或安装上游 CLI；维护适配时核对当前许可与声明。

## 图标与插画方法

登记或检查项目图形时，从 [视觉资产选择](visual-assets.md) 按需要进入 [图标](iconography.md) 或 [插画](illustration.md) 方法。Lucide 提供图标造型与一致性的参考，NN/g 提供识别与语境理解的评价思路，IBM 和 Atlassian 的官方页面用于在线查阅插画表达与使用场景。Init 只据此选择检查维度，项目规范仍须由已有资产、实现和真实确认支持。

本地执行规则不是上游规范快照。适配与外部阅读的区别、版权归属和限制见 [视觉指导来源声明](../third-party/visual-assets/NOTICE.md)，Lucide 的 [上游 LICENSE](../third-party/lucide/LICENSE) 随包保留。没有复制 IBM、Atlassian、NN/g 的正文或素材，也不把它们声明为本插件 MIT 授权内容。

## 获取方式

每次任务首次需要某份外部资料时，通过可用的网页或仓库读取工具获取官方现行页面或默认分支最新内容；不固定 tag、commit 或版本锁。只读与当前问题有关的文档，同一任务已读取的内容可复用；用户要求刷新时重新获取。链接失效时从官方导航或仓库当前目录定位新路径。

在对话中保留实际用到的来源链接和读取日期即可，无需创建本地来源档案。访问失败时说明未取得最新内容，继续已有项目依据能支持的盘点。

外部参考不会替换项目规范、逐模块确认、先整理现状再补齐的既定流程，也不会启用上游的后台学习或其他自动化。引用或复制内容时保留对应署名、许可和声明。

本 Skill 的原创内容采用 [MIT 许可证](../LICENSE)。Figma 操作按当前可用能力及 [工具衔接](figma-operations.md) 执行。
