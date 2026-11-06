---
schemaVersion: 1
page: task
annotations:
  - id: input
    target: task-form
    view: dimensions
    when:
      /phase: new
  - id: submit
    target: task-form/submit
    view: dimensions
    when:
      /phase: new
  - id: progress
    target: task-progress
    view: dimensions
    when:
      /phase: running
  - id: result
    target: task-result
    view: dimensions
    when:
      /phase: complete
  - id: recovery
    target: task-error
    view: dimensions
    when:
      /phase: error
sources:
  - kind: design
    ref: 通用模板的合成演示规则
---

## 输入与校验 {#input}

### 条件
主题必填；空白提交在字段下显示错误，修正后可重试。

### 操作
输入随本次体验保留。

## 提交规则 {#submit}

### 流程
1. 填写主题。
2. 点击“开始整理”创建本地任务；运行中禁止重复提交。
3. 完成后查看摘要与可下载材料。

## 运行反馈 {#progress}

### 状态
本地模拟接收、归纳、生成三个阶段，完成后切换到结果区；进度不代表真实 Agent 执行。

## 结果与材料 {#result}

### 操作
预览展开当前文本，下载保存同一份合成材料；内容仅供设计体验。

## 失败与恢复 {#recovery}

### 异常
失败保留主题；点击“重新整理”沿用原输入重试。
