# 页面导航与交互说明协议

工作台提供页面同步、①②标注、四种说明组件与离线阅读。每个需求独立维护 `interactions/*.md`，可按页面或流程拆文件；正文和关联信息都在文档中，组件只提供真实交互、路由适配和稳定定位。`requirement.md` 保存目标、范围、基线和验收；`scenarios.json` 只提供体验初始数据。

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

正文优先写触发、行为、反馈、异常和边界，按实际内容选用小节，不强塞空字段。默认显示当前页面、当前状态的条目；完整需求入口可以阅读目标与所有页面说明。定位目标暂时不可见时保留说明并明确提示。页面内编号跨状态稳定，隐藏条目可以留下编号空位。画面和说明通过稳定 ID 双向定位；打开辅助面板不改变产品尺寸。

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

`beforeNavigate` 返回 boolean 或 Promise<boolean>，只询问离开保护，不执行路由、清空草稿或提交业务。无未保存内容时返回 true；用户继续编辑时返回 false。signal 中止时关闭待决提示并保留输入。`navigate` 只在全部参与方案都通过检查后执行，才按原有语义丢弃已确认的草稿并切页。页面实际改变后 hook 上报当前页，顶部、说明与标注随后同步。产品内部入口使用 hook 返回的 requestNavigation，避免绕过协调器；原有把确认和切页混在同一回调中的接入，应拆成这两个阶段。

多个 `usePreviewState` 发布的字段应各有归属，避免相互覆盖。状态字段只承载当前可观察行为，不包含说明正文。无离开保护时可省略 beforeNavigate；navigate 仍负责实际路由。

使用 json-render store 管理路由的简单页面也可在 manifest 声明 `navigation: {pageStatePath: "/route"}`，工作台协调该路径上的页面写入，经过导航检查后再提交；非路由字段仍保留在本方案。有自定义路由适配时优先使用适配器；存在离开保护必须接入适配器，不能绕过保护直接改路径。无路由适配或路径时，工作台仍能切换页面 Spec，但工作台不能推断组件内部跳转。

普通导航保留 iframe 和 json-render store，不重新注入场景初始数据。共享 React 会话容器保持相同 Spec key 与组件类型；跨页需要保留的数据放在该容器或 store，不放在会卸载的页面组件内。选择预置场景或重置才初始化会话。顶部“当前交互状态”表示已离开初始预置状态，不把实际操作伪装成选中了另一个预置场景。

## 对比联动

对比模式共享页面、预置场景、显式重置、视口及稳定标注目标；两侧按各自真实尺寸定位。工作台切页或任一侧 requestNavigation 先询问两边离开保护，全部允许才切换；任一侧取消，两边都保留原页和草稿，已确认的一侧也不能提前清理，并在等待另一侧期间暂时锁定业务交互，取消后恢复。新请求、退出对比或重置会取消旧的待决检查。

切换“方案”或画布标题只改变当前编辑焦点，两侧位置和 iframe 会话保持。单独体验和对比之间切换也保留会话；进入对比时请求对齐到当前页，若离开保护取消则保留各自页面。预置场景和重置明确初始化两边。标注按稳定 ID/target 对应，说明条件按当前编辑方案的实际状态筛选；另一方案未出现目标时不虚构对应元素。

页面切换待决时暂停 Agent 生成；已有生成或提案时先取消、放弃或接受，再切页，避免更换预览文档使双方确认失效。

业务输入、任务、发布状态、Agent 调节与源码写回按方案独立。业务动作不在另一侧重放；同页中的对象选择、筛选与滚动不盲目复制。共享 React 根容器和 store 的生命周期仍需由需求组件正确维护。

## 验证

实际点击跨页并返回，检查顶部、当前说明和标注同步；测试取消离开、确认离开、数据保留和显式重置。通过业务动作改变运行、错误、权限或弹层状态，验证条件生效。检查任一侧发起导航、两侧确认／取消组合、切换编辑焦点不重排不丢输入、场景与视口联动、标注同目标定位及业务状态独立。按需导出的 HTML 使用同一份文档与运行协议，断网检查定位和阅读；临时截图与日志用后清理。
