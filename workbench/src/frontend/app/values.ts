import type {BundleData,Value} from "../../contracts/types";
const loadedValues=(data:BundleData,candidate:string,page:string):Record<string,Value>=>Object.fromEntries(data.manifest.controls.filter(c=>c.page===page).map(c=>[c.id,data.specs[candidate+":"+page].elements[c.target].props[c.property] as Value]));
export const allValues=(data:BundleData)=>Object.fromEntries(data.manifest.candidates.flatMap(c=>data.manifest.pages.map(p=>[c.id+":"+p.id,loadedValues(data,c.id,p.id)])));
