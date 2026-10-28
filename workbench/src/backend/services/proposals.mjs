import {assert} from "../../contracts/assertions.mjs";
import {validateControls} from "../../contracts/agent-controls.mjs";
import {validatePreview} from "../adapters/validate-preview.mjs";
import {authoredSources} from "../adapters/proposal-files.mjs";
import {checkAgentScope} from "./proposal-policy.mjs";
export async function validateJob(job,built){const impact=checkAgentScope(job);for(const candidate of impact.candidates)await validatePreview(built,candidate,{signal:job.controller.signal});return impact;}
export function checkControls(job,built,controls){
    const key=job.candidate+":"+job.page;validateControls(controls,built.data.specs[key],built.data.params[job.candidate].css);
    const authored=authoredSources(built.data.candidateRoots[job.candidate]);
    for(const c of controls)if(c.binding==="css")assert(new RegExp('var\\(\\s*'+c.property+'(?:\\s*[,\\)])').test(authored),"生成的样式控件没有关联实际样式："+c.id);
  }
