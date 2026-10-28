import {useRef,useState} from "react";
import type {NavigationCommand} from "../../../contracts/types";

type Context={candidate:string;compare:boolean;comparisonIds:string[];busy:()=>boolean;onStatus:(value:string)=>void};
export function useNavigation({candidate,compare,comparisonIds,busy,onStatus:setStatus}:Context) {
  const [navigationCommands,setNavigationCommands]=useState<Record<string,NavigationCommand>>({});
  const [waitingCandidates,setWaitingCandidates]=useState<string[]>([]);
  const [navigationPending,setNavigationPending]=useState(false);
  const navigation=useRef<{serial:number;page:string;ids:string[];ready:Set<string>}|null>(null);
  const navSerial=useRef(0);
  function commands(ids:string[],command:NavigationCommand){setNavigationCommands(old=>({...old,...Object.fromEntries(ids.map(id=>[id,command]))}));}
  function cancelNavigation(){setNavigationPending(false);setWaitingCandidates([]);const pending=navigation.current;if(pending){commands(pending.ids,{serial:pending.serial,page:pending.page,phase:"abort"});navigation.current=null;}}
  function navigate(next:string,origin=candidate,ids=compare&&comparisonIds.includes(origin)?comparisonIds:[origin]){
    if(busy()){setStatus("请先接受、放弃或取消当前生成，再切换页面");return;}
    cancelNavigation();setNavigationPending(true);const serial=++navSerial.current;navigation.current={serial,page:next,ids,ready:new Set()};
    commands(ids,{serial,page:next,phase:"prepare"});setStatus(ids.length>1?"正在检查两侧的离开保护…":"正在检查页面切换…");
  }
  function prepared(id:string,serial:number,allowed:boolean){
    const pending=navigation.current;if(!pending||pending.serial!==serial||!pending.ids.includes(id))return;
    if(!allowed){cancelNavigation();setStatus(pending.ids.length>1?"已取消切换，两侧页面与输入均保留":"已取消页面切换");return;}
    pending.ready.add(id);setWaitingCandidates([...pending.ready]);if(pending.ready.size===pending.ids.length){navigation.current=null;setNavigationPending(false);setWaitingCandidates([]);commands(pending.ids,{serial,page:pending.page,phase:"commit"});setStatus(pending.ids.length>1?"两侧已切换到同一页面，业务操作与输入分别保留":"");}
  }

  return {navigationCommands,waitingCandidates,navigationPending,navigate,prepared,cancelNavigation};
}
