import {outputSchema} from "./agent-output.mjs";

export function explorationSchemaFor(count=3){
  return {...outputSchema,required:[...outputSchema.required,"directions","pages","ready","operation","base"],properties:{...outputSchema.properties,files:{...outputSchema.properties.files,maxItems:0},controls:{...outputSchema.properties.controls,maxItems:0},ready:{type:"boolean"},operation:{type:"string",enum:["discuss","explore","refine","fuse"]},base:{type:"string"},pages:{type:"array",items:{type:"string"}},directions:{type:"array",minItems:0,maxItems:count,items:{type:"object",additionalProperties:false,required:["title","brief"],properties:{title:{type:"string"},brief:{type:"string"}}}}}};
}
export const explorationSchema=explorationSchemaFor();

export function explorationCount(prompt,fallback=3){
  const found=String(prompt??"").match(/([一二两三四1234])(?:个|套|种)?(?:不同的?)?(?:视觉|交互|设计)?(?:方案|方向)/);
  return found?({一:1,二:2,两:2,三:3,四:4}[found[1]]??Number(found[1])):fallback;
}

// An explicit request is required. Mentions, questions and negated requests do not start a batch.
export function requestsExploration(prompt){
  const text=String(prompt??"").trim();
  if(/(?:不要|不用|无需|不必|先不|暂不|别).{0,12}(?:探索|方案|方向)/.test(text)||/[？?]$/.test(text))return false;
  if(/(?:方案|方向)(?:的)?(?:含义|意思|用法|优劣|区别|差异|分析|解释|对比)/.test(text))return false;
  const lead="^(?:(?:请|麻烦|帮我|为我|帮忙|现在|先|再|我希望|我想|我需要)\\s*)*",count="(?:[二两三四234]|多)(?:个|套|种)?(?:不同的?)?(?:视觉|交互|设计)?(?:方案|方向)";
  return new RegExp(lead+"(?:给我|生成|提供|制作|设计|做|出|探索)\\s*(?:当前页(?:面)?的?)?\\s*"+count).test(text)||new RegExp("^(?:我想要|我需要|我希望有)\\s*"+count).test(text)||new RegExp(lead+"探索(?:视觉)?方案(?:[，,。！!]|$)").test(text);
}

export function proposalPage(proposal,page){
  if(!proposal)return undefined;
  if(proposal.page===page)return proposal;
  const preview=proposal.pages?.[page];
  return preview?{...proposal,...preview,page,controls:[]}:undefined;
}
