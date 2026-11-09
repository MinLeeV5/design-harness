import {useEffect,useMemo,useRef,useState} from "react";
import {createWorkbenchClient} from "../../api/workbench";
import type {CanvasCapture,ReviewAnchor,ReviewSnapshot,ReviewThread} from "../../../contracts/types";

type Context={id:string;candidate:string;page:string;enabled:boolean;token?:string;revision:string;proposalId?:string};
type Pending={anchor:ReviewAnchor;capture:CanvasCapture;proposalId?:string;designRevision:string;page:string};
export function useReviews(context:Context){
  const latest=useRef(context);latest.current=context;
  const api=useMemo(()=>createWorkbenchClient(context.token),[context.token]),key=context.id+":"+context.candidate,current=useRef(key);current.current=key;
  const [value,setValue]=useState<ReviewSnapshot & {scope:string}>({scope:key,version:0,threads:[]}),[error,setError]=useState(""),[saving,setSaving]=useState(false),busy=useRef(false);
  const [picking,setPicking]=useState(false),[pending,setPending]=useState<Pending|null>(null),[draft,setDraft]=useState(""),[selected,setSelected]=useState<string[]>([]),[focused,setFocused]=useState("");
  const [locations,setLocations]=useState<Record<string,string>>({});
  const snapshot=value.scope===key?value:{scope:key,version:0,threads:[]};
  const receive=(next:ReviewSnapshot,scope=key)=>{if(current.current===scope)setValue(old=>old.scope===scope&&(old.version>next.version||(JSON.stringify(old.threads)===JSON.stringify(next.threads)&&old.version===next.version&&old.sourceState===next.sourceState))?old:{...next,scope});};
  async function refresh(){const scope=key;try{const next=await api.reviews(context.id,context.candidate,latest.current.proposalId);receive(next,scope);}catch(e){if(current.current===scope)setError((e as Error).message);}}
  useEffect(()=>{setPending(null);setDraft("");setPicking(false);setSelected([]);setFocused("");setLocations({});setError("");if(!context.enabled)return;let stopped=false;const load=async()=>{if(stopped||busy.current)return;try{const next=await api.reviews(context.id,context.candidate,latest.current.proposalId);if(!stopped)receive(next,key);}catch(e){if(!stopped)setError((e as Error).message);}};void load();const timer=setInterval(load,1500);return()=>{stopped=true;clearInterval(timer);};},[key,context.enabled,api]);
  useEffect(()=>{setPicking(false);},[context.page]);
  function point(anchor:ReviewAnchor,capture:CanvasCapture){setPicking(false);setPending({anchor,capture,page:context.page,proposalId:context.proposalId,designRevision:context.revision});setError("");}
  async function mutate(body:Record<string,unknown>){if(busy.current)return false;const scope=key;busy.current=true;setSaving(true);setError("");try{const next=await api.reviewChange({id:context.id,candidate:context.candidate,expectedVersion:snapshot.version,...body});receive(next,scope);return true;}catch(e){if(current.current===scope){setError((e as Error).message);await refresh();}return false;}finally{busy.current=false;setSaving(false);}}
  async function save(){if(!pending||!draft.trim())return;const text=draft;if(await mutate({action:"create",...pending,text})){setPending(null);setDraft("");}}
  const choose=(id:string)=>setSelected(old=>old.includes(id)?old.filter(key=>key!==id):[...old,id]);
  return {api,sourceState:snapshot.sourceState,threads:snapshot.threads,version:snapshot.version,error,setError,saving,picking,setPicking,pending,draft,setDraft,point,save,selected,choose,focused,focus:setFocused,locations,setLocations,refresh,
    cancel(){setPending(null);setDraft("");setPicking(false);setError("");},
    reply:(thread:ReviewThread,text:string)=>mutate({action:"reply",thread:thread.id,text}),
    resolve:(thread:ReviewThread)=>mutate({action:thread.resolved?"reopen":"resolve",thread:thread.id}),
    selectedThreads:snapshot.threads.filter(thread=>selected.includes(thread.id))};
}
