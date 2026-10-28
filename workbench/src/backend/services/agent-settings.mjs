import {createAgentPreferences} from "../adapters/agent-preferences.mjs";
import {mergeAgentSettings,validateAgentSettings} from "../../contracts/agent-settings.mjs";

export function createAgentSettings(preferences=createAgentPreferences()){
  const sessions=new Map();
  function current(key){if(!sessions.has(key)){const initial=preferences.read();sessions.set(key,{...initial,...validateAgentSettings({...initial,permissionMode:"proposal"})});}return structuredClone(sessions.get(key));}
  async function update(key,patch){
    const previous=current(key);mergeAgentSettings(previous,patch);const {permissionMode,...persisted}=patch;if(Object.keys(persisted).length)await preferences.patch(persisted);
    const next=mergeAgentSettings(sessions.get(key)||previous,patch);sessions.set(key,next);return structuredClone(next);
  }
  function remember(key,{identity,model,effort,permissionMode}){let next=mergeAgentSettings(current(key),{identity,model,...(permissionMode?{permissionMode}:{})});if(effort)next=mergeAgentSettings(next,{effort});sessions.set(key,next);}
  return {current,update,remember,clear:()=>sessions.clear()};
}
