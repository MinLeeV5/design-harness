import type {AgentActivity,AgentApproval,AgentPermissionMode,AgentModel,CodexConnection,AgentObservationEvent} from "./types";
export interface AgentProvider {
  id:string;
  capabilities:{images:boolean;structuredOutput:boolean;interrupt:boolean};
  inspect(options?:{refresh?:boolean}):Promise<CodexConnection>;
  selectModel(model:string,effort:string):Promise<AgentModel>;
  createSession(input:{id:string;directory:string;model:AgentModel;permissionMode:AgentPermissionMode}):Promise<unknown>;
  runTurn(input:{session:unknown;directory:string;prompt:string;schema:object;imageFiles:string[];model:AgentModel;permissionMode:AgentPermissionMode;signal:AbortSignal;onObservation?:(event:AgentObservationEvent)=>void;onEvent:(event:Omit<AgentActivity,"startedAt">)=>void;onApproval:(request:Omit<AgentApproval,"id"|"state">,options?:{signal?:AbortSignal})=>Promise<{decision:"accept"|"decline"|"cancel";content?:Record<string,unknown>}>}):Promise<{summary:string;files:{path:string;content:string}[];controls?:unknown[]}>;
  closeSession(session:unknown):Promise<void>;
  dispose():Promise<void>;
}
