import type {AgentJob,AgentSession,AgentSessionSummary,BundleData,CodexConnection,AgentSettings,AgentSettingsPatch,ReviewSnapshot,ExplorationHistory} from "../../contracts/types";

// All local HTTP access lives here. Offline exports use the same UI without invoking this client.
export function createWorkbenchClient(token?:string) {
  const headers = () => ({"X-DH-Token":token!});
  const address=(path:string)=>typeof location!=="undefined"&&location.protocol==="blob:"?new URL(path,location.origin).toString():path;

  async function json<T>(path:string, init:RequestInit = {}, failure?:string):Promise<T> {
    const response = await fetch(address(path),{...init,headers:{...headers(),...init.headers}});
    if (!response.ok && failure) throw new Error(failure);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Agent 请求失败");
    return result as T;
  }

  return {
    reviews:(id:string,candidate:string,proposalId?:string)=>json<ReviewSnapshot>("/__dh/reviews?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate)+(proposalId?"&proposalId="+encodeURIComponent(proposalId):"")),
    reviewChange:(body:unknown)=>json<ReviewSnapshot>("/__dh/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),
    reviewImage:async(id:string,candidate:string,thread:string)=>{const response=await fetch(address("/__dh/reviews/image?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate)+"&thread="+encodeURIComponent(thread)),{headers:headers()});if(!response.ok)throw new Error("无法读取批阅截图");return response.blob();},
    connection: (refresh = false,sessionId="") => json<CodexConnection>(
      "/__dh/live/connection?refresh="+(refresh?"1":"0")+"&sessionId="+sessionId,{},"无法读取 Codex 状态，请重试。"
    ),
    session: (id:string,candidate:string,sessionId="") => json<AgentSession>(
      "/__dh/live/session?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate)+"&sessionId="+sessionId,{},"无法读取Agent会话"
    ),
    sessions: (id:string,candidate:string) => json<AgentSessionSummary[]>("/__dh/live/sessions?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate)),
    explorationHistory:(id:string,candidate:string)=>json<ExplorationHistory>("/__dh/live/explorations?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate)),
    deleteExploration:(body:object)=>json<{history:ExplorationHistory;deleted:string}>("/__dh/live/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,type:"exploration",action:"delete"})}),
    createSession: (id:string,candidate:string) => json<AgentSession>("/__dh/live/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,candidate})}),
    workspace: (id:string) => json<BundleData>("/__dh/workspace?id="+encodeURIComponent(id)),
    job: (id:string,sessionId="") => json<AgentJob>("/__dh/live/jobs/"+id+"?sessionId="+sessionId),
    saveSettings: (id:string,candidate:string,patch:AgentSettingsPatch,sessionId="") => json<AgentSettings>("/__dh/live/settings",{
      method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({id,candidate,patch,sessionId})
    }),
    event: (body:object,{keepalive=false}={}) => json<AgentJob>("/__dh/live/events",{
      method:"POST",keepalive,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
    }),
    async revision(id:string):Promise<string|undefined> {
      const response = await fetch("/__dh/revision?id="+encodeURIComponent(id));
      return response.ok ? (await response.json()).revision : undefined;
    },
    async exportHtml(id:string):Promise<Blob> {
      const response = await fetch("/__dh/export",{
        method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({id})
      });
      if (!response.ok) throw new Error((await response.json()).error);
      return response.blob();
    }
  };
}
