import {Component,useEffect,useLayoutEffect,useMemo,useRef,useState,useId,type ReactNode} from "react";
import {createRoot} from "react-dom/client";
import {JSONUIProvider,Renderer,createStateStore,useRepeatScope,type ComponentRegistry,type DefineRegistryResult,type ComponentRenderProps} from "@json-render/react";
import {markDevtoolsActive,type Catalog,type StateModel} from "@json-render/core";
import {createInspector} from "./inspector";
import {captureDocument} from "./capture";
import {createReviewOverlay} from "./reviews";
import {ScenarioContext,PreviewBridgeContext,type PreviewBridge,type NavigationAdapter} from "./sdk";
import {pointerValue} from "../contracts/conditions.mjs";
import type {ZodType} from "zod";
import type {Scenario,Spec,PreviewConfig as Config} from "../contracts/types";
type Project={catalog:Catalog & {data:{components:Record<string,{props:ZodType}>}};registry:ComponentRegistry;handlers?:DefineRegistryResult["handlers"]};
const send=(message:Record<string,unknown>)=>window.parent.postMessage(message,"*");
class Boundary extends Component<{children:ReactNode;resetKey?:string;report:(message:string)=>void},{error:string}> {
  state={error:""};
  static getDerivedStateFromError(error:Error){return {error:error.message};}
  componentDidCatch(error:Error){this.props.report(error.message);}
  componentWillUnmount(){this.props.report("");}
  componentDidUpdate(previous:Readonly<{children:ReactNode;resetKey?:string}>){if(this.state.error&&previous.resetKey!==this.props.resetKey){this.props.report("");this.setState({error:""});}}
  render(){return this.state.error?<p role="alert">组件运行失败：{this.state.error}</p>:this.props.children;}
}
function instanceFor(wrapper:Element):string {
  return [...wrapper.querySelectorAll<HTMLElement>("[data-dh-instance]")].find(node=>node.closest("[data-jr-key]")===wrapper)?.dataset.dhInstance??"";
}
function logicalTarget(element:Element) {
  const wrapper=element.closest<HTMLElement>("[data-jr-key]"),part=element.closest<HTMLElement>("[data-dh-part]");
  const key=wrapper?.dataset.jrKey;
  return {id:key+(part&&part.closest("[data-jr-key]")===wrapper?"/"+part.dataset.dhPart:""),instance:wrapper?instanceFor(wrapper):""};
}
function actualNode(element:HTMLElement):HTMLElement {
  while(getComputedStyle(element).display==="contents"&&element.firstElementChild)element=element.firstElementChild as HTMLElement;return element;
}
function hasExpression(value:unknown):boolean {return !!value&&typeof value==="object"&&Object.entries(value).some(([key,child])=>key.startsWith("$")||hasExpression(child));}
function previewStore(initial:Record<string,unknown>){
  let current=createStateStore(initial),routePath="",route:unknown,request:((page:string)=>void)|null=null,committing=false,correcting=false;
  const listeners=new Set<()=>void>(),notify=()=>{
    if(correcting)return;
    const next=routePath?current.get(routePath):undefined;
    if(request&&!committing&&typeof next==="string"&&next!==route){correcting=true;current.set(routePath,route);correcting=false;request(next);for(const listener of listeners)listener();return;}
    route=next;for(const listener of listeners)listener();
  };let stop=current.subscribe(notify);
  return {get:(path:string)=>current.get(path),set:(path:string,value:unknown)=>current.set(path,value),update:(values:Record<string,unknown>)=>current.update(values),getSnapshot:()=>current.getSnapshot(),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},replace:(updater:(state:StateModel)=>StateModel)=>{const next=updater(current.getSnapshot());stop();current=createStateStore(next);stop=current.subscribe(notify);notify();},gate(path:string,handler:(page:string)=>void){routePath=path;route=current.get(path);request=handler;},commit(action:()=>void){committing=true;try{action();}finally{committing=false;}}};
}
export function mount(project:Project) {
  const errors=new Map<string,string>();
  function reportError(source:string,message:string){
    if((errors.get(source)??"")===message)return;
    if(message)errors.set(source,message);else errors.delete(source);
    send({type:"dh:error",error:[...errors.values()].join("\n")});
  }
  const registry:ComponentRegistry=Object.fromEntries(Object.entries(project.registry).map(([name,Original])=>{
    function Checked({errorKey,...props}:ComponentRenderProps & {errorKey:string}){
      const schema=project.catalog.data.components[name]?.props;
      const validation=schema?.safeParse(props.element.props);
      const message=!validation?.success?"Catalog 属性校验失败："+name+" "+JSON.stringify(validation?.error??"缺少属性定义"):"";
      useEffect(()=>{reportError(errorKey+":props",message);return()=>reportError(errorKey+":props","");},[errorKey,message]);
      return message?<p role="alert">{message}</p>:<Original {...props}/>;
    }
    function Tracked(props:ComponentRenderProps){
      const scope=useRepeatScope(),errorKey=useId(),content=<Boundary report={message=>reportError(errorKey+":component",message?name+"："+message:"")} resetKey={JSON.stringify(props.element.props)}><Checked errorKey={errorKey} {...props}/></Boundary>;
      return scope?<span data-dh-instance={scope.basePath} style={{display:"contents"}}>{content}</span>:content;
    }
    return [name,Tracked];
  }));
  function RenderSpec({config}:{config:Config}) {
    const initialScenario=useMemo(()=>({...config.scenario,page:config.page??config.scenario.page,state:{...config.scenario.state,...config.initialState}}),[]);
    const store=useMemo(()=>previewStore({...config.spec.state,...initialScenario.state}),[]);
    const current=useRef(config);current.current=config;
    const bridge=useMemo(()=>{
      let adapter:NavigationAdapter|null=null,page=config.page??config.scenario.page,scheduled=false,disposed=false,last="",requestId=-1,pending:{serial:number;page:string;controller:AbortController;allowed:boolean}|null=null;
      const states=new Map<string,Record<string,unknown>>();
      const lock=(waiting:boolean)=>{const root=document.getElementById("root")!;root.inert=waiting;if(waiting&&document.activeElement instanceof HTMLElement&&root.contains(document.activeElement))document.activeElement.blur();};
      const notify=()=>{if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{
        scheduled=false;if(disposed)return;
        const c=current.current;
        if(!adapter&&c.navigation){const value=pointerValue(store.getSnapshot(),c.navigation.pageStatePath);if(typeof value==="string")page=value;}
        if(!(c.pages??[c.scenario.page]).includes(page)){reportError("navigation","预览上报了未登记的页面："+page);return;}
        reportError("navigation","");const context={page,state:{...c.scenario.state,...store.getSnapshot(),...Object.assign({},...states.values())}},signature=JSON.stringify(context);
        if(signature!==last){last=signature;send({type:"dh:context",context,session:c.session});}
      });};
      const request=(target:string)=>{if(!disposed&&(current.current.pages??[current.current.scenario.page]).includes(target))send({type:"dh:navigation-intent",page:target,session:current.current.session});};
      if(config.navigation)store.gate(config.navigation.pageStatePath,request);
      const api:PreviewBridge={attach(next){adapter=next;notify();return()=>{if(adapter===next)adapter=null;};},request,reportPage(next){page=next;notify();},setState(id,state){if(state)states.set(id,state);else states.delete(id);notify();}};
      const navigate=(event:MessageEvent)=>{
        if(event.source!==window.parent||event.data?.type!=="dh:navigate"||event.data.session!==current.current.session||!Number.isInteger(event.data.serial))return;
        const {serial,phase}=event.data,target=event.data.page;
        if(!(current.current.pages??[current.current.scenario.page]).includes(target))return;
        if(phase==="prepare"){
          if(serial<=requestId)return;requestId=serial;pending?.controller.abort();lock(false);
          const attempt={serial,page:target,controller:new AbortController(),allowed:false};pending=attempt;
          Promise.resolve().then(()=>page===target?true:adapter?.beforeNavigate?.(target,attempt.controller.signal)??true).then(allowed=>{
            if(disposed||pending!==attempt||attempt.controller.signal.aborted)return;
            attempt.allowed=allowed===true;if(attempt.allowed)lock(true);send({type:"dh:navigation-prepared",serial,allowed:attempt.allowed,session:current.current.session});
          }).catch(error=>{if(pending!==attempt||attempt.controller.signal.aborted)return;reportError("navigation","页面切换检查失败："+String(error));send({type:"dh:navigation-prepared",serial,allowed:false,session:current.current.session});});
        }else if(phase==="abort"&&serial>=requestId){requestId=serial;pending?.controller.abort();pending=null;lock(false);
        }else if(phase==="commit"&&pending&&pending.serial===serial&&pending.page===target&&pending.allowed){
          pending=null;store.commit(()=>{if(adapter)adapter.navigate(target);else {page=target;if(current.current.navigation)store.set(current.current.navigation.pageStatePath,target);}});lock(false);notify();
        }
      };
      return {api,notify,navigate,start(){disposed=false;return store.subscribe(notify);},dispose(){disposed=true;pending?.controller.abort();pending=null;lock(false);}};
    },[store]);
    useLayoutEffect(()=>{const stop=bridge.start();window.addEventListener("message",bridge.navigate);bridge.notify();return()=>{stop();bridge.dispose();window.removeEventListener("message",bridge.navigate);};},[bridge]);
    useLayoutEffect(()=>{const defaults=config.spec.state??{},snapshot=store.getSnapshot();if(Object.keys(defaults).some(key=>!Object.hasOwn(snapshot,key)))store.replace(state=>({...defaults,...state}));bridge.notify();},[config.page,config.spec,bridge,store]);
    const handlers=useMemo(()=>{
      const actions=project.handlers?.(()=>store.replace,()=>store.getSnapshot())??{};
      return Object.fromEntries(Object.entries(actions).map(([name,action])=>[name,async(params:Record<string,unknown>)=>{try{await action(params);reportError("action:"+name,"");}catch(error){reportError("action:"+name,"动作 "+name+" 失败："+(error as Error).message);throw error;}}]));
    },[store]);
    useEffect(()=>()=>{for(const name of Object.keys(handlers))reportError("action:"+name,"");},[handlers]);
    return <ScenarioContext.Provider value={initialScenario}><PreviewBridgeContext.Provider value={bridge.api}><JSONUIProvider registry={registry} store={store} handlers={handlers}><Renderer spec={config.spec} registry={registry}/></JSONUIProvider></PreviewBridgeContext.Provider></ScenarioContext.Provider>;
  }
  function Preview() {
    const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState("");
    useEffect(()=>markDevtoolsActive(),[]);
    useEffect(()=>{const activate=()=>send({type:"dh:activate"});document.addEventListener("pointerdown",activate,true);return()=>document.removeEventListener("pointerdown",activate,true);},[]);
    useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==window.parent||event.data?.type!=="dh:capture"||typeof event.data.serial!=="string")return;try{send({type:"dh:capture-result",serial:event.data.serial,html:captureDocument()});}catch(error){send({type:"dh:capture-result",serial:event.data.serial,error:(error as Error).message});}};window.addEventListener("message",receive);return()=>window.removeEventListener("message",receive);},[]);
    useEffect(()=>{
      const receive=(event:MessageEvent)=>{
        if(event.source!==window.parent||event.data?.type!=="dh:config")return;
        const next=event.data.config as Config;
        try {
          const validation=project.catalog.validate(next.spec);
          if(!validation.success)throw new Error("Catalog 属性校验失败："+JSON.stringify(validation.error));
          for(const [id,element] of Object.entries(next.spec.elements)){
            if(!project.registry[element.type])throw new Error("Registry 缺少组件："+element.type+"（"+id+"）");
            const schema=project.catalog.data.components[element.type]?.props;
            if(!schema)throw new Error("Catalog 缺少组件属性定义："+element.type+"（"+id+"）");
            if(!hasExpression(element.props)){const checked=schema.safeParse(element.props);if(!checked.success)throw new Error("Catalog 属性校验失败："+id+" / "+element.type+" "+JSON.stringify(checked.error));}
          }
          const implemented=project.handlers?.(()=>undefined,()=>({}))??{},builtIn=new Set(project.catalog.schema.builtInActions?.map(action=>action.name)??[]);
          function checkBinding(value:unknown,label:string):void {
            if(Array.isArray(value)){value.forEach((entry,index)=>checkBinding(entry,label+"["+index+"]"));return;}
            if(!value||typeof value!=="object")return;
            const binding=value as {action?:unknown;onSuccess?:unknown;onError?:unknown};
            if(typeof binding.action==="string"&&!builtIn.has(binding.action)&&(!project.catalog.actionNames.includes(binding.action)||typeof implemented[binding.action]!=="function"))throw new Error("动作未注册或缺少实现："+binding.action+"（"+label+"）");
            checkBinding(binding.onSuccess,label+".onSuccess");checkBinding(binding.onError,label+".onError");
          }
          for(const [id,element] of Object.entries(next.spec.elements))for(const kind of ["on","watch"] as const)for(const [event,binding] of Object.entries(element[kind]??{}))checkBinding(binding,id+"."+kind+"."+event);
          reportError("spec","");setError("");setConfig(next);
        }catch(e){const message=(e as Error).message;setError(message);reportError("spec",message);}
      };
      window.addEventListener("message",receive);send({type:"dh:mounted"});return()=>window.removeEventListener("message",receive);
    },[]);
    useEffect(()=>{
      const inspector=createInspector({send}),reviews=createReviewOverlay({send});
      const receive=(event:MessageEvent)=>{if(event.source===window.parent&&event.data?.type==="dh:config"){inspector.update(event.data.config);reviews.update(event.data.config);}};
      window.addEventListener("message",receive);return()=>{window.removeEventListener("message",receive);inspector.dispose();reviews.dispose();};
    },[]);
    useEffect(()=>{if(config)for(const [name,value]of Object.entries(config.css))if(/^--[a-z][a-z0-9-]*$/.test(name))document.documentElement.style.setProperty(name,value);},[config]);
    if(error)return <p role="alert">{error}</p>;
    return config?<Boundary report={message=>reportError("root",message)} resetKey={JSON.stringify(config.spec)} key={config.scenario.id+":"+config.candidate}><RenderSpec key={config.scenario.id+":"+config.candidate} config={config}/></Boundary>:null;
  }
  window.addEventListener("error",event=>reportError("uncaught",event.message));
  window.addEventListener("unhandledrejection",event=>reportError("unhandled",String(event.reason)));
  createRoot(document.getElementById("root")!).render(<Preview/>);
}
