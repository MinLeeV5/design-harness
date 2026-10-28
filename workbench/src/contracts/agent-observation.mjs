const count=value=>Number.isSafeInteger(value)&&value>=0;
function breakdown(value){
  if(!value||!["inputTokens","outputTokens","totalTokens"].every(key=>count(value[key])))return;
  return Object.fromEntries(["inputTokens","cachedInputTokens","outputTokens","reasoningOutputTokens","totalTokens"].filter(key=>count(value[key])).map(key=>[key,value[key]]));
}
export function tokenUsage(value){
  const last=breakdown(value?.last),total=breakdown(value?.total);
  if(!last&&!total)return;
  return {...(last?{last}:{}),...(total?{total}:{}),...(count(value.modelContextWindow)&&value.modelContextWindow>0?{modelContextWindow:value.modelContextWindow}:{}),updatedAt:Date.now()};
}
