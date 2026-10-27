import {createContext,useCallback,useContext,useId,useLayoutEffect,useRef} from "react";
export const ScenarioContext=createContext<{id:string;state:Record<string,unknown>}>({id:"",state:{}});
export const useScenario=()=>useContext(ScenarioContext);
/** A named part inside a registered component, used only for review targeting. */
export const designPart=(name:string)=>({"data-dh-part":name});
export type NavigationAdapter={navigate:(page:string)=>void;beforeNavigate?:(page:string,signal:AbortSignal)=>boolean|Promise<boolean>};
export type PreviewBridge={attach:(adapter:NavigationAdapter)=>()=>void;request:(page:string)=>void;reportPage:(page:string)=>void;setState:(id:string,state:Record<string,unknown>|null)=>void};
export const PreviewBridgeContext=createContext<PreviewBridge|null>(null);
/** Connect the real router, including its existing leave guard, to the workbench. */
export function usePreviewNavigation({page,navigate,beforeNavigate,state}:NavigationAdapter & {page:string;state?:Record<string,unknown>}) {
  const bridge=useContext(PreviewBridgeContext),latest=useRef({navigate,beforeNavigate,page});latest.current={navigate,beforeNavigate,page};
  useLayoutEffect(()=>bridge?.attach({navigate:next=>latest.current.navigate(next),beforeNavigate:(next,signal)=>next===latest.current.page?true:latest.current.beforeNavigate?.(next,signal)??true}),[bridge]);
  useLayoutEffect(()=>bridge?.reportPage(page),[bridge,page]);
  usePreviewState(state??{});
  return useCallback((next:string)=>{if(bridge)bridge.request(next);else {const signal=new AbortController().signal;Promise.resolve(latest.current.beforeNavigate?.(next,signal)??true).then(allowed=>{if(allowed)latest.current.navigate(next);});}},[bridge]);
}
/** Publish observable product state for conditional documentation, without document content. */
export function usePreviewState(state:Record<string,unknown>) {
  const bridge=useContext(PreviewBridgeContext),id=useId(),signature=JSON.stringify(state);
  useLayoutEffect(()=>{bridge?.setState(id,state);},[bridge,id,signature]);
  useLayoutEffect(()=>()=>bridge?.setState(id,null),[bridge,id]);
}
export type {BaseComponentProps} from "@json-render/react";
