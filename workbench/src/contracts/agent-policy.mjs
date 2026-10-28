export const candidateText=/\.(?:json|tsx?|jsx?|css|svg)$/i;
export const designText=/\.(?:json|tsx?|jsx?|css|svg|md)$/i;
const sharedFiles=new Set(["requirement.md","handoff.md","scenarios.json","manifest.json"]);
export const sharedDesignFile=file=>sharedFiles.has(file)||/^interactions\/.+\.md$/.test(file);

export function allowAgentFile(file,job) {
  if(file.startsWith("candidates/"+job.candidate+"/"))return candidateText.test(file);
  if(file==="handoff.md")return true;
  if(job.role!=="interaction")return false;
  return sharedDesignFile(file)||/^candidates\/[a-z][a-z0-9-]*\/pages\/.+\.json$/.test(file);
}
