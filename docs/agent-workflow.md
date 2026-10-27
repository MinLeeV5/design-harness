# 仓库 Agent 协作

DevKeel 为本仓库的 Codex 开发会话提供执行入口和通用能力。根目录 [AGENTS.md](../AGENTS.md) 保留常驻约束并按任务路由项目知识；四个公开入口仍须由用户显式启动。

## 知识与约束的归属

| 位置 | 内容与读取条件 |
| --- | --- |
| 根 `AGENTS.md` | 每次任务生效的执行契约、仓库边界及条件读取入口；不追加完整历史规范或维护手册 |
| [Skill 维护指南](skill-maintenance.md) | 修改设计流程、本地知识协议、Skill 资源、外部来源或分发约定时，读取对应主题及阶段依据 |
| [README](../README.md) | 插件定位、四个入口、用户工作方式、安装与开发命令 |
| 各公开 Skill 的 `references/` | 本阶段工作流、评价和来源路由，引用插件公共资源 |
| `shared/` 与 `workbench/` | 分别保存唯一公共模板／指导／来源声明与唯一工作台／CLI，随完整插件分发 |
| [验证范围](validation.md)、[品牌说明](../assets/README.md) | 分别承载验证细节和品牌资源维护要求 |

执行约束和授权边界不能只埋在背景说明中。调整存放位置时，先在目标文档合并并核对语义与链接，再从 `AGENTS.md` 删除原段落并补上必读条件；已有内容按主题复用，不保留整段正文副本。命令以 `package.json` 为准，不在多个入口维护第二套值。

## 资产与边界

| 位置 | 用途 |
| --- | --- |
| `.harness/skills/` | DevKeel 通用开发 Skills，与插件分发的 `skills/` 分开维护 |
| `.harness/rules/`、`.harness/agents/` | 经确认后添加的仓库专属约束与角色；尚无内容时保留空目录 |
| `.harness/commands/` | 通用工作流命令 |
| `.harness/versions.yml` | 已安装模板的组件版本记录 |
| `.agents/skills`、`.agents/rules`、`.agents/agents`、`.agents/commands` | 指向对应 `.harness/` 目录的相对链接 |
| `.agents/plugins/marketplace.json` | Design Harness 插件市场入口，继续指向根目录插件 |
| `openspec/` | 本仓库的规范、任务过程与 Lite/Full 模板；是否创建任务记录由用户决定 |
| `docs/` | 插件使用、开发与验证说明，复用已有文档 |

使用方项目的设计知识、独立需求与交接保存在其代码仓库的 design-harness/，与业务工程运行隔离，不迁入本插件仓库。DevKeel 接入不启动设计入口，也不启用 hooks、遥测或自动跨项目学习。

ZIP 沿用现有文件白名单，不包含 `.harness/`、`openspec/` 或新增的平台链接。插件引用检查也不将这两个开发目录中的模板示例链接当成已生成的插件资产。公开 Skill 不依赖 DevKeel；单独复制 Skill 不包含共享指导、模板和工作台；使用完整 Design Harness 插件。

`.harness/skills-state.json` 与 `.harness/skills-backups/` 是被 Git 忽略的本地入口状态及冲突备份，不作为项目知识提交。

DevKeel 执行契约、开发 Skills、命令和 OpenSpec 模板来自官方 `devkeel-templates` 包，保留其 [MIT 许可](third-party/devkeel/LICENSE)。来源为 [DevKeel 仓库](https://github.com/MinLeeV5/devkeel)，安装组件版本以 `.harness/versions.yml` 为准。许可随维护文档保留在 ZIP 中，涵盖其中使用的 DevKeel 执行契约；开发能力目录本身仍不分发。

## 检查与更新

从仓库根目录执行入口自检与 OpenSpec 可用性检查：

```sh
npx devkeel@latest doctor
npx devkeel@latest openspec list
```

更新前查看计划并核对本地改动，再按需要执行更新：

```sh
npx devkeel@latest update --dry-run
npx devkeel@latest update
```

更新可能覆盖受管内容，保留原有项目规则并逐项检查差异。技能入口发生冲突时先检查内容，按 DevKeel 的备份流程处理，不删除整个平台目录。

新增项目知识时可显式调用 `$domain-init`，基于真实代码和已有约定选择扫描范围，经 review 后合并；需要补齐测试能力时可显式调用 `$verify-init`。已有的 [验证说明](validation.md) 与 `node:test` 测试继续复用，不因初始化额外安装测试框架。

`doctor` 只检查静态入口，OpenSpec 列表只证明 CLI 可运行。仓库检查使用 `npm run check`，分发、协议与工作区的覆盖范围见 [验证说明](validation.md)；真实页面体验另用 `npm run test:browser` 验证。安装入口后应在新的 Codex 会话中确认 Skills 是否可发现，不能仅凭链接存在宣称会话已加载。

接入与检查不自动提交、推送或发布。完整安装和维护步骤参见 [DevKeel 接入指南](https://raw.githubusercontent.com/MinLeeV5/devkeel/HEAD/web/public/install.md)。
