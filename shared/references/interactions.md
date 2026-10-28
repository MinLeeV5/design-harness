# 页面导航与交互说明协议

本协议定义页面状态、说明与稳定目标的关联。每个需求独立维护 `interactions/*.md`，可按页面或流程拆文件；正文和关联信息都在文档中，组件只提供真实交互、路由适配和稳定定位。`requirement.md` 保存目标、范围、基线和验收；`scenarios.json` 只提供体验初始数据。

## 文档格式

每个文件以 YAML 配置开始；正文用二级标题和 `{#稳定ID}` 声明交互条目，三级标题组织细节。配置与正文一一对应，ID 在整个需求中唯一。文件按相对路径排序，条目按 annotations 顺序排列。

```markdown
---
schemaVersion: 1
page: catalog
annotations:
  - id: start-task
    target: catalog-list/start
    view: steps
    placement: auto
    when:
      /available: true
sources:
  - kind: prd
    ref: requirement.md
---

## 开始任务 {#start-task}

进入任务页，沿用当前租户与选中的对象。

### 触发
点击“使用”。

### 行为与反馈
打开任务页，保留本次体验上下文。

### 异常与边界
资格失效时展示原因及恢复入口。
```

| 字段 | 约定 |
| --- | --- |
| schemaVersion | 固定为 1 |
| page | manifest.pages 中的页面 ID；`"*"` 表示各页共有说明 |
| annotations[].id | 需求内唯一的小写字母开头 ID，对应正文二级标题锚点 |
| target | Spec 元素 ID，或 `元素ID/子目标`；组件用 designPart 暴露子目标 |
| view | card（默认）、steps、rules、states |
| placement | auto（默认）、top、right、bottom、left；位置按真实目标边界计算，不写像素坐标 |
| when | 可选，JSON Pointer 到预览状态值的条件；多个字段同时满足，值数组表示任选一个值；缺失字段不等于 null |
| sources | 可选来源数组，kind 为 user、prd、code 或 design，ref 为可读来源；区分已确认决定、现状与设计提案 |

条件仅支持字符串、数字、布尔值、null 及其非空数组，不执行表达式或 JavaScript。YAML 拒绝重复字段、别名、未知字段。目标根元素需在各候选对应页面中存在，子目标在真实预览中检查。

## 四种说明组件

- card：摘要加可展开的操作与边界，用于独立行为。
- steps：摘要加有序步骤，各三级标题是一项步骤。
- rules：三级标题与内容形成规则表；内容可使用标准 Markdown 表格。
- states：各三级标题是一种状态，内容写反馈、允许操作与恢复方式。

正文优先写触发、行为、反馈、异常和边界，按实际内容选用小节，不强塞空字段。说明按当前页面与状态筛选。定位目标暂时不可见时保留说明并明确提示。页面内编号跨状态稳定，隐藏条目可以留下编号空位。画面和说明通过稳定 ID 双向定位；

## 页面与状态同步

组件内自定义路由接入固定 SDK：

```tsx
import {usePreviewNavigation,usePreviewState} from "@design-harness/preview";

const requestNavigation = usePreviewNavigation({
  page,
  beforeNavigate: (target, signal) => confirmLeave(target, signal),
  navigate: target => { discardConfirmedDraft(); router.go(target); },
  state: {role, tenant}
});
usePreviewState({phase, connection, material});
// 产品内部的页面入口也使用 requestNavigation(target)。
```

`beforeNavigate` 返回 boolean 或 Promise<boolean>，只询问离开保护，不执行路由、清空草稿或提交业务。无未保存内容时返回 true；用户继续编辑时返回 false。signal 中止时关闭待决提示并保留输入。`navigate` 只在全部参与方案都通过检查后执行，才按原有语义丢弃已确认的草稿并切页。页面实际改变后 hook 上报当前页，说明与标注据此匹配。产品内部入口使用 hook 返回的 requestNavigation，避免绕过协调器；原有把确认和切页混在同一回调中的接入，应拆成这两个阶段。

多个 `usePreviewState` 发布的字段应各有归属，避免相互覆盖。状态字段只承载当前可观察行为，不包含说明正文。无离开保护时可省略 beforeNavigate；navigate 仍负责实际路由。

使用 json-render store 管理路由的简单页面也可在 manifest 声明 `navigation: {pageStatePath: "/route"}`，工作台协调该路径上的页面写入，经过导航检查后再提交；非路由字段仍保留在本方案。有自定义路由适配时优先使用适配器；存在离开保护必须接入适配器，不能绕过保护直接改路径。无路由适配或路径时，工作台仍能切换页面 Spec，但工作台不能推断组件内部跳转。

普通导航保留 iframe 和 json-render store，不重新注入场景初始数据。共享 React 会话容器保持相同 Spec key 与组件类型；跨页需要保留的数据放在该容器或 store，不放在会卸载的页面组件内。选择预置场景或重置才初始化会话。实际运行状态与初始预置场景分开记录。

## 多候选行为边界

各候选的业务输入、任务、发布状态和设计修改保持独立。导航适配需支持取消与保留草稿，只有全部参与方通过离开保护后才提交导航；beforeNavigate 不提前清理状态。共享 React 根容器与 store 的生命周期由需求组件维护。

## 验证

实际点击跨页并返回，检查导航、说明条件与稳定目标匹配；验证取消离开保留输入、确认后提交导航、跨页数据保留和显式重置。通过真实业务动作改变加载、错误、权限与弹层状态，区分实际可到达路径和仅预置的初始状态。共享变更核对所有候选，验证材料与结论遵循交付保真。
