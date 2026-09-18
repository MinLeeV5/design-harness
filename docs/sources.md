# 来源、适配与许可

## 架构与访谈参考

- [设计 Harness 文章](https://rexandduckie.substack.com/p/stop-chasing-design-tools-start-building)：参考 Context / Skills / Workflow / Evaluation / Knowledge 的分层思路，未复制文章正文。
- [BilLogic/harness-designing-plugin 固定版本](https://github.com/BilLogic/harness-designing-plugin/tree/c998fe3ed4d8627903a900d4fc2c622657a3be3f)：仅保留架构与评价思路作为背景；本次重构不沿用其 Skill、工作流或文件组织。保留 [MIT 许可](../third-party/harness-designing-plugin/LICENSE) 与版本记录。
- 用户提供的 harness-cli brainstorming（版本 8.0.2，检查时仓库 revision 为 4a2a99955aa03ce38ffb4e6a8845c5b68818edd9）与 grilling：参考一次一个问题、推荐理由、成熟度判断、事实/决策/委托/未决的分离。本插件独立编写访谈指导，不复制其实现或全文，不携带其 OpenSpec 流程和百分比机制，也不要求安装它们。未分发这些参考 Skill 的文件。

项目知识统一在项目 Figma 沉淀；插件承载通用方法。用户确认后的具体知识增量可以回写，自动跨项目知识学习不在本版本范围。

## Impeccable

[Impeccable 固定版本](https://github.com/pbakaus/impeccable/tree/f2c7051853848826aac2f4646581d62a732155ad)，作者 Paul Bakaus 与贡献者，Apache-2.0。

[中文适配指导](../references/impeccable.md) 根据其任务导向、操作界面、critique、native audit、harden、clarify、polish 内容改写，文件头标明修改。保留原始 [LICENSE](../third-party/impeccable/LICENSE) 与 [NOTICE](../third-party/impeccable/NOTICE.md)。NOTICE 提及的 ios/android 平台参考文件未随本包分发。

通用建议服从项目规范。包不包含上游 CLI、检测器、下载器或 hooks；使用本插件不代表运行过上游 Impeccable 工具。

## 版本与许可维护

[upstream-lock.json](../third-party/upstream-lock.json) 记录参考仓库 commit、读取文件哈希、分发许可证与 NOTICE 哈希。更新适配内容时复核源版本、许可和行为差异，不能无记录跟随上游 HEAD。

原创 Skill、工作流、蓝图与脚本使用根目录 [MIT LICENSE](../LICENSE)；Impeccable 适配内容遵循 Apache-2.0。第三方许可分别保留。

## Codex 与 Figma 能力依据

插件结构按环境提供的 plugin-creator / skill-creator 规范校验，安装指令核对当前 Codex CLI。参考 OpenAI [插件文档](https://learn.chatgpt.com/docs/plugins)。

Figma 读取助手采用 figma-use 提供的 Plugin API：root.children、getNodeByIdAsync、setCurrentPageAsync、children、parent、TEXT.characters；不依赖全文件加载、隐藏 pluginData 或外部运行服务。实际操作前仍按当前安装的 Figma Skill 与 API 支持范围执行，具体衔接见 [Figma 操作](../references/figma-operations.md)。
