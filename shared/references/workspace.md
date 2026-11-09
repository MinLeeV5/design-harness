# 工具包与项目资源

工作台、渲染器、构建器、预览桥接及导出由 Design Harness 工具包维护。推荐将 CLI 声明为宿主项目根 package.json 的开发依赖，也支持全局安装；Codex 插件提供可选阶段入口。设计阶段使用 design-harness，源码或插件可直接调用工具包根目录的 workbench/cli.mjs；入口优先使用项目本地版本。skills 命令返回当前采用版本的阶段入口与 shared/ 公共指导位置，按这些路径读取。产品讨论无需初始化设计工作区；单独复制 Skill 不包含完整能力。

项目 design-harness/ 只承载业务设计资源：

```text
project.json
foundation/                        公共组件、Catalog、Registry、Token 与素材
requirements/<需求>/
  manifest.json
  requirement.md
  interactions/*.md                独立交互正文、页面归属、条件与标注
  scenarios.json
  handoff.md
  explorations/<候选>/
    state.json                    方案轮次、版本、来源与设计结论
    snapshots/<hash>.json         需求设计源清单
    objects/<hash>                去重设计文件与引用画面
  candidates/<候选>/
    catalog.ts
    registry.tsx
    pages/<页面>.json              独立完整 json-render Spec
    params.json
    components/
    assets/
reviews/
```

运行、构建和 Agent 属于工具包；design-harness/ 资源目录不保留 releases、业务工程源码副本、runtime 或 evidence；探索保存需求内设计版本。临时截图、模型结果和检查输出用后清理，只把必要结论记入交接。

explorations/ 是随需求保存的独立方案历史，不参与正式设计 revision，不复制公共基础或运行器；重启后按当前基础恢复。保存历史与接受当前设计分开，用户显式删除才清理无引用内容，见[设计探索历史](protocol.md#设计探索历史)。

requirements 是本地设计产物的唯一维护来源；用户指定正式业务 PRD 时按[来源与承接](product-source.md)记录设计摘要与来源。工作台按需导出单文件 HTML；CLI 通过 --out 选择资源目录外的文件，历史用 Git 记录。

项目的[设计组织模式](design-organization.md)保存在 project.json：持续模式维护同一产品主稿，按需求模式维护独立设计。两者复用相同资源协议与唯一 foundation；单次拆分由用户明确提出，不改项目默认，不自动合并。基础验证预览单独标明用途。

页面同步和说明写法见[交互协议](interactions.md)。说明、字段和命令分别见[协议](protocol.md)、[操作](preview-export.md)、[交接](handoff.md)。可选 package.json 只声明精确版本的业务扩展依赖，锁文件为 dependencies.lock.json；安装与构建缓存放在项目之外。

## 组件与页面

页面结构使用 json-render 原生 Spec；Catalog 定义组件属性及动作，Registry 将名称映射到自定义 React 实现。复杂布局、菜单、焦点和业务模拟由项目 React 组件维护；按真实组件职责拆分，不把完整页面压成无法检查的占位组件。Spec 与组件共同构成 UI 来源，Markdown 保存设计依据。

公共基础只在项目根目录保留一处，所有需求、候选和按需导出都使用它，引用为 @design-harness/foundation/...。公共更新应保持向下兼容，并验证既有需求；不为每个需求或导出复制基础。每个候选保存完整 Spec、参数与专属实现，不通过差异补丁依赖另一候选。克隆候选复制实际文件。

Init 的基础验证预览也使用 requirements/ 下的现有协议，明确其验证用途，以完整 Spec 复用公共组件和项目实际页面模式；页面组合只在该目录维护，不在 foundation 中另存一套模板 UI 树。它用于核对基础的覆盖、布局及状态，不代表启动新的业务需求。验证结果记入其 handoff.md；公共基础变化时一并复验。

## 依据与质量

从项目规范、指定版本的实际运行界面、组件和资产提取事实，保留环境、提交、路由与上下文。历史稿和 Mock 是各自范围内的依据，不能替代现网证据。沿用、新增和已确认变化分别记录。

通用模板是合成数据局部流程，默认基础仍为草稿。完整 UI 按[交付保真](fidelity.md)覆盖实际产品壳层、上下文切换、菜单、分割线、固定与滚动区域及状态；工作台分离不降低保真要求。项目真实标识、路径、源码映射和任务记录不得进入插件通用资源。
