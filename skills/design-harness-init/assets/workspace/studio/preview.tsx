import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import type {PageComponent,Scenario} from "./types";
type Config={scenario:Scenario;candidate:string;css:Record<string,string>;pick:boolean;locate?:string};
export function mount(Page:PageComponent) {
  function Preview() {
    const [config,setConfig]=useState<Config|null>(null);
    useEffect(()=>{
      const receive=(event:MessageEvent)=>{
        if(event.source!==window.parent || event.data?.type!=="dh:config") return;
        setConfig(event.data.config);
      };
      window.addEventListener("message",receive);
      window.parent.postMessage({type:"dh:mounted"},"*");
      return ()=>window.removeEventListener("message",receive);
    },[]);
    useEffect(()=>{
      if(!config) return;
      for(const [name,value] of Object.entries(config.css)) if(/^--[a-z][a-z0-9-]*$/.test(name)) document.documentElement.style.setProperty(name,value);
      const report=()=>{
        const ids=[...document.querySelectorAll<HTMLElement>("[data-dh-id]")].map(el=>el.dataset.dhId!);
        window.parent.postMessage({type:"dh:elements",ids,duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i)},"*");
        document.querySelectorAll("[data-dh-located]").forEach(el=>el.removeAttribute("data-dh-located"));
        if(config.locate) {
          const target=document.querySelector('[data-dh-id="'+CSS.escape(config.locate)+'"]');
          target?.setAttribute("data-dh-located","");
          target?.scrollIntoView({block:"center",behavior:"instant"});
        }
      };
      const timer=requestAnimationFrame(report);
      const observer=new MutationObserver(()=>{report();});
      observer.observe(document.getElementById("root")!,{childList:true,subtree:true});
      const select=(event:MouseEvent)=>{
        if(!config.pick) return;
        const target=(event.target as Element).closest<HTMLElement>("[data-dh-id]");
        if(!target) return;
        event.preventDefault(); event.stopPropagation();
        window.parent.postMessage({type:"dh:select",id:target.dataset.dhId},"*");
      };
      const escape=(event:KeyboardEvent)=>{
        if(!config.pick || event.key!=="Escape")return;
        event.preventDefault();event.stopPropagation();
        window.parent.postMessage({type:"dh:escape"},"*");
      };
      document.addEventListener("click",select,true);
      document.addEventListener("keydown",escape,true);
      return ()=>{cancelAnimationFrame(timer);observer.disconnect();document.removeEventListener("click",select,true);document.removeEventListener("keydown",escape,true);};
    },[config]);
    useEffect(()=>{
      const style=document.createElement("style");
      style.textContent="[data-dh-located]{outline:2px solid #7254dc!important;outline-offset:5px}";
      document.head.append(style); return ()=>style.remove();
    },[]);
    return config ? <Page key={config.scenario.id+":"+config.candidate} scenario={config.scenario} candidate={config.candidate}/> : null;
  }
  createRoot(document.getElementById("root")!).render(<Preview/>);
}
