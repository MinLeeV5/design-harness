import type {AgentJob,AgentSession,CodexConnection,AgentSettings,AgentSettingsPatch} from "../../contracts/types";

// All local HTTP access lives here. Offline exports use the same UI without invoking this client.
export function createWorkbenchClient(token?:string) {
  const headers = () => ({"X-DH-Token":token!});

  async function json<T>(path:string, init:RequestInit = {}, failure?:string):Promise<T> {
    const response = await fetch(path,{...init,headers:{...headers(),...init.headers}});
    if (!response.ok && failure) throw new Error(failure);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Agent 请求失败");
    return result as T;
  }

  return {
    connection: (refresh = false) => json<CodexConnection>(
      "/__dh/live/connection"+(refresh?"?refresh=1":""),{},"无法读取 Codex 状态，请重试。"
    ),
    session: (id:string,candidate:string) => json<AgentSession>(
      "/__dh/live/session?id="+encodeURIComponent(id)+"&candidate="+encodeURIComponent(candidate),{},"无法读取Agent会话"
    ),
    job: (id:string) => json<AgentJob>("/__dh/live/jobs/"+id),
    saveSettings: (id:string,candidate:string,patch:AgentSettingsPatch) => json<AgentSettings>("/__dh/live/settings",{
      method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({id,candidate,patch})
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
