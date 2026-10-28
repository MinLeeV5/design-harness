import {assert} from "../../contracts/assertions.mjs";
import {SourceConflict} from "../../contracts/errors.mjs";
import {buildRequirement} from "../services/preview.mjs";
import {exportHtml} from "../services/export.mjs";
import {firstRequirement,requirementRevision,saveValues} from "../services/workspace.mjs";
import {readJsonBody,replyJson} from "./requests.mjs";

export function createRouter({workspace, token, agent, origin}) {
  return async (request, response) => {
    const reply = (status, data) => replyJson(response,status,data);
    const authorized = message => {
      if (request.headers["x-dh-token"] === token) return true;
      reply(403,{error:message});
      return false;
    };
    try {
      const address = origin();
      assert(request.headers.host === new URL(address).host, "Host 不匹配");
      if (request.headers.origin) assert(request.headers.origin === address, "Origin 不匹配");
      const url = new URL(request.url,address);

      if (request.method === "GET" && url.pathname === "/") {
        const id = url.searchParams.get("id") || firstRequirement(workspace);
        if (!id) {
          response.writeHead(200,{"Content-Type":"text/plain; charset=utf-8"});
          response.end("尚无需求，请从插件工具运行 new <需求ID> --project <项目>");
          return;
        }
        const {html} = await buildRequirement(workspace,id,{development:true,token});
        response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
        response.end(html);
        return;
      }
      if (request.method === "GET" && url.pathname === "/__dh/revision") {
        reply(200,{revision:requirementRevision(workspace,url.searchParams.get("id"))});
        return;
      }
      if (request.method === "GET" && url.pathname === "/__dh/live/session") {
        if (authorized("会话需要当前工作台")) reply(200,agent.session(url.searchParams.get("id"),url.searchParams.get("candidate")));
        return;
      }
      if (request.method === "GET" && url.pathname === "/__dh/live/connection") {
        if (authorized("连接状态需要当前工作台")) reply(200,await agent.connection({refresh:url.searchParams.get("refresh") === "1"}));
        return;
      }
      if (request.method === "GET" && /^\/__dh\/live\/jobs\/[a-f0-9]{32}$/.test(url.pathname)) {
        if (authorized("生成记录需要当前工作台")) reply(200,agent.get(url.pathname.split("/").at(-1)));
        return;
      }
      if (request.method !== "POST" || !["/__dh/spec","/__dh/export","/__dh/live/events","/__dh/live/settings"].includes(url.pathname)) {
        reply(404,{error:"入口不存在"});
        return;
      }
      if (request.headers.origin !== address || request.headers["x-dh-token"] !== token) {
        reply(403,{error:"写入需要当前本地工作台"});
        return;
      }
      const body = await readJsonBody(request,url.pathname === "/__dh/live/events" ? 15000000 : 65536);
      if (url.pathname === "/__dh/live/settings") {
        reply(200,await agent.saveSettings(body.id,body.candidate,body.patch));
        return;
      }
      if (url.pathname === "/__dh/live/events") {
        reply(200,await agent.event(body));
        return;
      }
      if (url.pathname === "/__dh/export") {
        const {html,filename} = await exportHtml(workspace,body.id);
        response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Content-Disposition":'attachment; filename="'+filename+'"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
        response.end(html);
        return;
      }
      reply(200,saveValues(workspace,body));
    } catch (error) {
      reply(error instanceof SourceConflict ? 409 : 400,{error:error.message});
    }
  };
}
