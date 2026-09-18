# Design Harness

一个以项目 Figma 为知识载体的 Codex 设计插件。提供两个入口：**Init 建立项目上下文，Design 在项目约束下完成新需求设计**。v0.1 已按新的工作方式重构，旧六入口和本地运行记录流程已移除。

## 使用

| 入口 | 给它什么 | 它会做什么 |
| --- | --- | --- |
| `$design-harness-init` | Figma 项目 + 代码仓库 | 先整理现状，逐模块确认，再补齐代码已有而 Figma 缺失的知识与资产 |
| `$design-harness-design` | Figma 项目 + 新需求 | 读取入口并按需加载资源，逐题访谈，确认后生成多个方案，选定后确认知识回写 |

示例：

> 用 $design-harness-init 根据这个 Figma 项目和代码仓库建立 Harness。先整理现状，每个模块先给我看具体提案，确认后再生成。

> 用 $design-harness-design 读取这个 Figma 项目的 Harness，帮我设计新的设备连接流程。先逐题讨论，再生成方案供我选择。

会话已有 Figma、仓库、范围和确认时直接沿用，不重复要求填写。团队使用需要可访问的项目及 Figma 原生读写能力；本插件不自带 Figma 连接器或账号权限。只有读取能力时仍可完成调查和访谈，写入缺口会明确报告。

## 项目知识放在哪里

- **Figma 的 design-harness Page**：AGENTS 式入口、项目上下文、风格约束、token/变量说明与样例、布局、组件库、模板库、场景库、已确认知识和需求索引。
- **每次需求的独立 Page**：确认后的需求摘要、多方案、关键页面、必要状态、交互说明、选择与知识增量记录。
- **代码仓库**：当前实现和来源映射的依据。项目知识链接到具体文件、符号、资源和版本。
- **这个插件仓库**：通用 Skill、工作流、评价标准、Figma 内容蓝图与读取助手。

变量与样式本身是 Figma 文件级资产，Harness Page 统一呈现其语义、索引和用法。组件必须是可复用的原生资产，索引或截图不能代替组件库。

入口只保留少量全局约束和模块目录。Agent 从入口读到相关模块概览，再读取所需资源和依赖；不会默认把整张 Page 或整个文件加载到上下文。[上下文契约](references/figma-context.md) 定义了可见原生文本的组织方式。

## 工作方式

**Init**：只读调查 → 逐模块展示具体内容、冲突与呈现建议 → 确认后整理存量 → 全部适用模块现状明确后，逐模块确认并补齐代码已有的缺失 → 回读与视觉检查。

**Design**：按需读取 Harness → 一次一个问题的访谈 → 整体需求确认 → 独立需求 Page 中的多方案 → 内嵌评价和修正 → 用户选择 → 展示并确认知识增量 → 回写 Harness。

每次提问给出推荐与理由，开放问题、真实取舍、情境检验按需要使用。访谈结论承载于对话，确认后在需求 Page 附摘要；没有本地 `brief.md` 或 `run.json` 要求。

项目规范优先，Impeccable 提供通用补充。默认交付关键页面、必要状态和交互说明；可点击原型按比较需要增加。每个方案必须有实质差异，评价直接检查任务、资产和实际渲染。

“倾向代码”用于还原当前事实；已确认的新设计可先以**已确认设计／待实现**沉淀，后续盘点不能用旧实现覆盖它。用户已经明确批准的相同内容与范围不重复确认。

## 安装与团队分发

本机开发更新：使用 Codex 的 plugin-creator 更新流程刷新缓存版本后，从已配置的本地 marketplace 重新安装；在**新任务**使用更新后的 Skill。不要手动修改安装缓存或 marketplace 配置。

构建可分发包：

```sh
python3 scripts/validate.py
python3 -m unittest discover -s tests -v
node --test tests/figma-reader.test.js
python3 scripts/package_plugin.py --out dist/build
```

输出 zip 与 SHA-256，重复构建使用新的输出目录，避免覆盖旧包。解压后包含 marketplace 根目录和插件：

```text
design-harness-0.1.0/
  .agents/plugins/marketplace.json
  plugins/design-harness/
```

团队成员解压到固定目录，然后使用本机 Codex CLI：

```sh
codex plugin marketplace add /path/to/design-harness-0.1.0
codex plugin add design-harness@design-harness-team
```

上述路径是解压后的 marketplace 根目录，需要替换为实际位置；解压后的源目录需保留。此操作注册本地包，不发布到远端市场。安装后新建任务使用两个入口。

## 维护与阅读

- [Init 工作流](workflows/init.md) · [模块产出标准](references/init-modules.md)
- [Design 工作流](workflows/design.md) · [访谈机制](references/interview.md)
- [Figma 上下文契约](references/figma-context.md) · [工具衔接](references/figma-operations.md)
- [知识更新](references/knowledge-update.md) · [评价标准](evaluation/checks.md) · [Impeccable 指导](references/impeccable.md)
- [迁移说明](docs/migration.md) · [验证范围](docs/validation.md) · [来源与许可](docs/sources.md)

辅助脚本测试验证读取范围、截断续读与分发包一致性，不能证明真实项目的设计质量。实际运行 Init/Design 时仍需按工作流完成具体模块的用户确认、原生资产检查和截图核验。

原创部分采用 [MIT](LICENSE)；Impeccable 适配内容遵循 Apache-2.0，并保留上游声明。
