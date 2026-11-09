import http from "node:http";
import {randomBytes} from "node:crypto";
import {openWorkspace} from "../services/workspace.mjs";
import {createLiveAgentRuntime} from "../services/agent-runtime.mjs";
import {createRouter} from "./routes.mjs";
import {createReviewService} from "../services/reviews.mjs";

export async function startServer(workspace,{port=4173,agentRun,agentConnection,agentPreferences,projectRoot,reviewCapture}={}) {
  workspace=openWorkspace(workspace);
  const token=randomBytes(24).toString("hex");
  const reviews=createReviewService(workspace,{capture:reviewCapture});
  const agent=createLiveAgentRuntime(workspace,{run:agentRun,connection:agentConnection,preferences:agentPreferences,projectRoot,reviews});
  let origin="";
  const server=http.createServer(createRouter({workspace,token,agent,reviews,origin:()=>origin}));
  server.once("close",()=>void agent.close());
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(port,"127.0.0.1",resolve);
  });
  origin="http://127.0.0.1:"+server.address().port;
  return {server,origin,close:async()=>{
    await agent.close();
    return new Promise(resolve=>server.close(resolve));
  }};
}
