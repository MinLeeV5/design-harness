import {createAgentPreferences} from "../adapters/agent-preferences.mjs";
import {mergeAgentSettings} from "../../contracts/agent-settings.mjs";

export function createAgentSettings(preferences=createAgentPreferences()){
  const sessions=new Map();
  function current(key){if(!sessions.has(key))sessions.set(key,preferences.read());return structuredClone(sessions.get(key));}
  async function update(key,patch){
    const previous=current(key);mergeAgentSettings(previous,patch);await preferences.patch(patch);
    const next=mergeAgentSettings(sessions.get(key)||previous,patch);sessions.set(key,next);return structuredClone(next);
  }
  function remember(key,{identity,model,effort}){let next=mergeAgentSettings(current(key),{identity,model});if(effort)next=mergeAgentSettings(next,{effort});sessions.set(key,next);}
  return {current,update,remember,clear:()=>sessions.clear()};
}
