import {test} from "node:test";
import assert from "node:assert/strict";
import {renderMarkdown} from "../workbench/src/contracts/markdown.mjs";

test("Markdown renders headings, inline formatting, nested lists, quotes and GFM tables",()=>{
  const html=renderMarkdown("## 会话 **标题**\n\n**重点**、*说明*、~~删除~~与 `code`。\n\n- 条目\n  - 子项\n\n1. 操作\n2. 反馈\n\n> 引用\n\n| 字段 | 含义 |\n| --- | --- |\n| name | 名称 |\n");
  for(const pattern of [/<h2>会话 <strong>标题<\/strong><\/h2>/,/<strong>重点<\/strong>/,/<em>说明<\/em>/,/<del>删除<\/del>/,/<code>code<\/code>/,/<ul>[\s\S]*<ul>/,/<ol>/,/<blockquote>/,/<table>[\s\S]*<td>name<\/td>/])assert.match(html,pattern);
});

test("Code fences preserve source, indentation and language even while incomplete",()=>{
  const source='  const html = "<div>&内容</div>";\n\treturn html;';
  for(const suffix of ["","\n```"]){
    const html=renderMarkdown("```ts\n"+source+suffix);
    assert.match(html,/<pre><code class="language-ts">  const html = &quot;&lt;div&gt;&amp;内容&lt;\/div&gt;&quot;;\n\treturn html;\n<\/code><\/pre>/);
    assert.doesNotMatch(html,/<div>/);
  }
  assert.match(renderMarkdown("```ts\nconst pending = \"未完成"),/<pre><code class="language-ts">const pending/);
});

test("Chat line breaks are opt-in and document anchors remain scoped and safe",()=>{
  assert.equal(renderMarkdown("第一行\n第二行"),"<p>第一行\n第二行</p>\n");
  assert.equal(renderMarkdown("第一行\n第二行",{breaks:true}),"<p>第一行<br>第二行</p>\n");
  const html=renderMarkdown("## **输入** {#input}\n\n[跳转](#input)\n",{prefix:"overview-"});
  assert.match(html,/<h2 id="overview-input"><strong>输入<\/strong><\/h2>/);
  assert.match(html,/href="#overview-input"/);
  assert.match(renderMarkdown("# 标题 {#input}",{prefix:'x" onmouseover="unsafe'}),/id="x&quot; onmouseover=&quot;unsafeinput"/);
});

test("Untrusted HTML, images and executable URLs never produce active content",()=>{
  const source='<script>window.INJECTED=1</script>\n\n<img src=x onerror="alert(1)">\n\n# <svg onload=alert(1)>标题</svg>\n\n![图片](https://example.invalid/private.png)\n\n[脚本](javascript:alert(1)) [编码脚本](jav&#x61;script:alert(1)) [文件](file:///tmp/test) [相对](./secret) [数据](data:text/html,test) [参考](https://example.com/docs)';
  const html=renderMarkdown(source);
  assert.doesNotMatch(html,/<script|<img|<svg|href="(?:javascript:|jav&#|file:|data:|\.\/)/i);
  assert.match(html,/&lt;script&gt;window.INJECTED=1&lt;\/script&gt;/);
  assert.match(html,/图片/);
  assert.match(html,/href="https:\/\/example.com\/docs" target="_blank" rel="noreferrer"/);
});
