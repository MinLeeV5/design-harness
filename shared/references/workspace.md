# 插件工具与项目资源

工作台、渲染器、构建器、预览桥接及导出由完整插件的固定工具维护。三个入口直接调用插件根目录的 workbench/cli.mjs；模板与公共指导统一保存在 shared/，项目不复制工作台源码。运行与读取共享指导都需要完整插件，单独复制 Skill 不作为安装方式。

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
  candidates/<候选>/
    catalog.ts
    registry.tsx
    pages/<页面>.json              独立完整 json-render Spec
    params.json
    components/
    assets/
reviews/
```

运行、构建和 Agent 属于插件；项目不保留 releases、源码副本、runtime 或 evidence。临时截图、模型结果和检查输出用后清理，只把必要结论记入交接。

requirements 是唯一需求维护来源。工作台按需导出单文件 HTML；CLI 通过 --out 选择资源目录外的文件，历史用 Git 记录。

页面同步和说明写法见[交互协议](interactions.md)。说明、字段和命令分别见[协议](protocol.md)、[操作](preview-export.md)、[交接](handoff.md)。可选 package.json 只声明精确版本的业务扩展依赖，锁文件为 dependencies.lock.json；安装与构建缓存放在项目之外。

## 组件与页面

页面结构使用 json-render 原生 Spec；Catalog 定义组件属性及动作，Registry 将名称映射到自定义 React 实现。复杂布局、菜单、焦点和业务模拟由项目 React 组件维护；按真实组件职责拆分，不把完整页面压成无法检查的占位组件。Spec 与组件共同构成 UI 来源，Markdown 保存设计依据。

公共基础只在项目根目录保留一处，所有需求、候选和按需导出都使用它，引用为 @design-harness/foundation/...。公共更新应保持向下兼容，并验证既有需求；不为每个需求或导出复制基础。每个候选保存完整 Spec、参数与专属实现，不通过差异补丁依赖另一候选。克隆候选复制实际文件。

## 依据与质量

从项目规范、指定版本的实际运行界面、组件和资产提取事实，保留环境、提交、路由与上下文。历史稿和 Mock 是各自范围内的依据，不能替代现网证据。沿用、新增和已确认变化分别记录。

通用模板是合成数据局部流程，默认基础仍为草稿。完整 UI 按[交付保真](fidelity.md)覆盖实际产品壳层、上下文切换、菜单、分割线、固定与滚动区域及状态；工作台分离不降低保真要求。项目真实标识、路径、源码映射和任务记录不得进入插件通用资源。
