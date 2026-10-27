import {defineRegistry} from "@json-render/react";
import {components} from "@design-harness/foundation/registry";
import {catalog} from "./catalog";
import {TaskWorkspace,TaskForm,TaskProgress,TaskError,TaskResult} from "./components/Task";
export {catalog};
export const {registry,handlers}=defineRegistry(catalog,{components:{...components,TaskWorkspace,TaskForm,TaskProgress,TaskError,TaskResult},actions:{
  runTask:async (_params,setState)=>{setState(state=>({...state,phase:"running"}));}
}});
