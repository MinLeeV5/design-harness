import {assert} from "../../contracts/assertions.mjs";

export function replyJson(response, status, data) {
  response.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"});
  response.end(JSON.stringify(data));
}

export async function readJsonBody(request, limit) {
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    assert(length <= limit, "请求过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
