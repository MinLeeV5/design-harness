---
schemaVersion: 1
page: task
annotations:
  - id: input
    target: task-form
    view: card
    when:
      /phase: new
  - id: submit
    target: task-form/submit
    view: steps
    when:
      /phase: new
  - id: progress
    target: task-progress
    view: states
    when:
      /phase: running
  - id: result
    target: task-result
    view: rules
    when:
      /phase: complete
  - id: recovery
    target: task-error
    view: card
    when:
      /phase: error
sources:
  - kind: design
    ref: 通用模板的合成演示规则
---

## 输入与校验 {#input}

填写需要整理的主题，输入会随本次体验保留。

### 触发
在“任务主题”中输入对象与目标。

### 异常与边界
主题必填；空白提交显示字段错误，修正后可以再次提交。

## 提交规则 {#submit}

点击开始后创建本地演示任务。

### 交代主题
保留用户填写的完整主题。

### 开始整理
只在显式点击后运行；运行中禁止重复提交。

### 查看结果
完成后显示摘要和可下载材料。

## 运行反馈 {#progress}

示例显示三个阶段，不代表真实 Agent 执行。

### 接收任务
保持输入，进入运行状态。

### 归纳资料
展示当前进展，禁止重复创建任务。

### 生成结果
完成后切换到结果与材料。

## 结果与材料 {#result}

可预览并下载本地示例材料。

### 可用操作
| 条件 | 操作 | 结果 |
| --- | --- | --- |
| 整理完成 | 预览材料 | 展开同一份文本 |
| 需要保存 | 下载材料 | 下载实际文本文件 |

### 边界
材料采用合成数据，不作为真实分析结果。

## 失败与恢复 {#recovery}

失败时保留主题，可以恢复原任务。

### 触发
点击“重新整理”。

### 行为与反馈
沿用相同输入重新进入运行过程。
