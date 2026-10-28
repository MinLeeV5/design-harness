import {Marked} from "marked";
export const escapeHtml=text=>String(text).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
export function renderMarkdown(source,{prefix="",breaks=false}={}) {
  const md=new Marked({async:false,gfm:true,breaks,renderer:{
    html({text}){return escapeHtml(text);},
    link({href,tokens}){const safe=/^(https?:\/\/|#[a-z][a-z0-9-]*$)/.test(href||"")?href:"#";return '<a href="'+escapeHtml(safe.startsWith("#")?"#"+prefix+safe.slice(1):safe)+'" target="_blank" rel="noreferrer">'+this.parser.parseInline(tokens)+'</a>';},
    image({text}){return escapeHtml(text);},
    heading({text,depth}){const match=/\s+\{#([a-z][a-z0-9-]*)\}\s*$/.exec(text);return "<h"+depth+(match?' id="'+escapeHtml(prefix+match[1])+'"':"")+">"+md.parseInline(match?text.slice(0,match.index):text)+"</h"+depth+">";}
  }});return md.parse(source);
}
