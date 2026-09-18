# Figma 工具衔接与写入

本插件提供工作流与可复用读取函数，Figma 原生读写由当前会话可用的连接器执行。先发现实际可用能力，不假设安装本插件就具有 Figma 写权限。

## 按操作加载工具说明

- 调用 `use_figma` 前，读取当前 Figma 插件提供的 `figma-use` Skill 与实际 API 约束；每次调用遵守其要求并传正确的 skillNames。
- 建原生变量/组件库时使用可用的 `figma-generate-library` 指导；生成完整页面时使用 `figma-generate-design` 指导；读取 `get_design_context` 前遵守 `figma-design-to-code` 的前置要求。
- 创建文件与创建 Page 不同。本流程通常在用户项目中新建 Page；不能为了缺少入口而擅自创建另一个 Figma 文件。
- 不在分发包写死某台电脑的 Skill 路径、Figma fileKey、仓库地址、字体或品牌色。按环境发现能力，按项目读取资产。

如果只有读取能力，可以继续盘点、准备可审阅内容和访谈；明确哪些写入未完成以及缺少什么能力。不要把图片、SVG 导入或本地说明文件冒充原生组件库。写入受阻时保留已授权方案，不反复索要同一授权。

## 有界读取助手

[figma-reader.js](../scripts/figma-reader.js) 定义无依赖函数 `readDesignHarness(figma, request)`。读取该文件，把函数源码放入 `use_figma` 的代码正文，末尾追加一次调用，例如：

```js
return await readDesignHarness(figma, {action: "pages"});
```

在调用中实际替换 ID，不要直接执行下列占位值：

```js
return await readDesignHarness(figma, {
  action: "page-index", pageId: "<目标 Page 的真实 ID>"
});
```

```js
return await readDesignHarness(figma, {
  action: "read", pageId: "<目标 Page ID>",
  nodeIds: ["<入口或模块概览 TEXT 的真实 ID>"]
});
```

- `pages` 只取 Page 名称与 ID，并列出精确匹配 `design-harness` 的候选；不会自动替用户选多个候选之一。
- `page-index` 只读已选 Page 的顶层元数据，返回入口候选。目录超过上限时用返回的 `nextOffset` 接续，不扩大到递归全文。
- `node-index` 对明确指定的局部容器提供同样的子节点分页；参数为 `pageId`、`nodeId`、可选 `offset`/`limit`。深度或节点预算用尽时，按返回的 `childOffset` 继续定位小节点。
- `read` 只读显式节点及小范围子节点的可见原生文本；拒绝 PAGE/DOCUMENT、跨页及重复目标，限制目标数、遍历节点、深度和字符量。隐藏子树不作为已知规范；需要时单独检查并说明。
- 返回 `truncated` 表示不完整。`continuations` 给出节点 ID、原因以及 `childOffset` 或 `textOffset`；`continuationNodeIds` 是其去重摘要。长 TEXT 可单独用 `textOffset` 分段（JavaScript UTF-16 偏移），容器则先 `node-index`。不能把截断结果作为完整约束。
- 每次调用重新选 Page 一次；不依赖上次工具的当前页面状态，不调用全文件加载或隐藏 pluginData。

函数只帮助可靠定位和限制读取，不替代项目语义判断、变量 API、资产属性检查或截图。错误会终止当前读取，不悄悄换一个同名节点。

## 写入过程

每次只写已批准的模块或需求范围。准备布局与内容后再请求尚缺的确认；已经批准的操作直接执行。

1. 回读目标 Page 与相关原始节点，确认来源和目标不同、无并发变动影响本次计划。
2. 读取当前工具 API 文档，使用支持的原生创建/克隆/实例 API。先加载实际字体，再修改文本；布局用项目合适的 Frame/Auto Layout。
3. 创建真实内容和资产，保留 source→new 节点映射。只有实际 Component/ComponentSet 才声明为组件；组件描述属性不能误用到普通 Frame。
4. 如创建变量/样式，复用已确认资产或使用批准的命名空间；核对文件级 ID、模式、别名和节点绑定。编辑一个 Page 的许可不能推导为改写全部全局变量。
5. 在 Figma 原生 TEXT 填写 [上下文契约](figma-context.md) 的入口、模块、资源与 [需求 Page](../templates/requirement-page.txt) 摘要。避免把整个知识库做成不可读取图片。
6. 返回实际创建/修改节点 ID、类型和关系。再回读关键属性并查看截图，按 [检查标准](../evaluation/checks.md) 修正。

失败/超时先回读受影响区域，确定哪些对象已创建，再继续缺项。不要在不确定结果下重复生成整模块。工具不支持需要的原生属性时报告具体缺口，不把近似结果标成完成。

对方案页面可复制项目模板并替换实例/内容；对组件库应优先实例化或创建原生组件。与任务无关的源码、Figma 历史 Page 和已发布组件库不在默认写入范围。
