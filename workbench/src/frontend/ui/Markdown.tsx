import {useId,useMemo} from "react";
import {renderMarkdown} from "../../contracts/markdown.mjs";
import "./markdown.css";

export function Markdown({source}:{source:string}) {
  const prefix="agent-"+useId().replace(/[^a-z0-9-]/gi,"")+"-";
  const html=useMemo(()=>renderMarkdown(source,{prefix,breaks:true}),[source,prefix]);
  return <div className="markdown-content" dangerouslySetInnerHTML={{__html:html}}/>;
}
