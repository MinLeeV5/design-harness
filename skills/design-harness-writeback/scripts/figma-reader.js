/* Read-only Figma helper. Paste this definition into use_figma, then call it.
 * No imports, storage, semantic routing, or content mutations.
 * Text offsets use JavaScript UTF-16 offsets, as String.slice does.
 */
async function readDesignHarness(figma, request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("A read request is required");
  }
  const actions = ["pages", "page-index", "node-index", "read"];
  if (!actions.includes(request.action)) throw new Error("Unknown read action");

  function integer(value, fallback, minimum, maximum, field) {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
      throw new Error("Invalid " + field);
    }
    return result;
  }
  function metadata(node) {
    const name = String(node.name || "");
    return {id: node.id, type: node.type, name: name.slice(0, 256),
      ...(name.length > 256 ? {nameTruncated: true} : {})};
  }
  function belongsToPage(node, pageId) {
    let cursor = node;
    for (let count = 0; cursor && count < 256; count += 1) {
      if (cursor.type === "PAGE") return cursor.id === pageId;
      cursor = cursor.parent;
    }
    return false;
  }

  if (request.action === "pages") {
    const pages = figma.root.children;
    return {action: "pages", pages: pages.map(metadata),
      candidates: pages.filter(page => page.name.trim().toLowerCase() === "design-harness")
        .map(page => page.id)};
  }

  if (typeof request.pageId !== "string" || !request.pageId) {
    throw new Error("A real pageId is required");
  }
  const page = await figma.getNodeByIdAsync(request.pageId);
  if (!page || page.type !== "PAGE") throw new Error("Target Page does not exist");
  await figma.setCurrentPageAsync(page);

  async function resolveTarget(id) {
    if (typeof id !== "string" || !id) throw new Error("A real node ID is required");
    const node = await figma.getNodeByIdAsync(id);
    if (!node) throw new Error("Node does not exist: " + id);
    if (node.type === "PAGE" || node.type === "DOCUMENT") {
      throw new Error("Use page-index instead of reading an entire Page or document");
    }
    if (!belongsToPage(node, page.id)) throw new Error("Node is outside the selected Page: " + id);
    return node;
  }

  if (request.action === "page-index" || request.action === "node-index") {
    const parent = request.action === "page-index" ? page : await resolveTarget(request.nodeId);
    if (!("children" in parent)) throw new Error("Node has no child index");
    const offset = integer(request.offset, 0, 0, Number.MAX_SAFE_INTEGER, "offset");
    const limit = integer(request.limit, 50, 1, 100, "limit");
    const children = parent.children;
    if (offset > children.length) throw new Error("Offset is beyond the child index");
    const slice = children.slice(offset, offset + limit);
    const nextOffset = offset + slice.length < children.length ? offset + slice.length : null;
    return {action: request.action, pageId: page.id, parentId: parent.id,
      nodes: slice.map(metadata), total: children.length, offset, nextOffset,
      truncated: nextOffset !== null,
      entryCandidates: slice.filter(node => node.type === "FRAME" && node.name === "DH / AGENTS")
        .map(node => node.id)};
  }

  const ids = request.nodeIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 12) {
    throw new Error("read needs 1–12 explicit nodeIds");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate target node IDs");
  const limits = request.limits === undefined ? {} : request.limits;
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("Invalid limits");
  }
  const maxNodes = integer(limits.nodes, 120, 1, 200, "nodes limit");
  const maxChars = integer(limits.chars, 12000, 1, 20000, "chars limit");
  const maxDepth = integer(limits.depth, 4, 0, 8, "depth limit");
  const textOffset = integer(request.textOffset, 0, 0, Number.MAX_SAFE_INTEGER, "textOffset");
  const targets = [];
  for (const id of ids) targets.push(await resolveTarget(id));
  if (request.textOffset !== undefined && (targets.length !== 1 || targets[0].type !== "TEXT")) {
    throw new Error("textOffset requires one explicit TEXT target");
  }

  let visitedNodes = 0;
  let characters = 0;
  const textNodes = [];
  const skippedHiddenNodeIds = [];
  const continuations = [];

  function continuation(node, reason, detail) {
    continuations.push({nodeId: node.id, reason, ...detail});
  }
  function walk(node, depth, initialOffset) {
    if (visitedNodes >= maxNodes) {
      continuation(node, "node-budget", {});
      return;
    }
    visitedNodes += 1;
    if (node.visible === false) {
      skippedHiddenNodeIds.push(node.id);
      return;
    }
    if (node.type === "TEXT") {
      const source = node.characters;
      if (initialOffset > source.length) throw new Error("textOffset is beyond the TEXT content");
      const text = source.slice(initialOffset, initialOffset + maxChars - characters);
      const end = initialOffset + text.length;
      characters += text.length;
      textNodes.push({...metadata(node), text, textOffset: initialOffset,
        nextTextOffset: end < source.length ? end : null});
      if (end < source.length) continuation(node, "text-budget", {textOffset: end});
      return;
    }
    if (!("children" in node)) return;
    const children = node.children;
    if (depth >= maxDepth && children.length) {
      continuation(node, "depth-budget", {childOffset: 0});
      return;
    }
    for (let index = 0; index < children.length; index += 1) {
      if (visitedNodes >= maxNodes || characters >= maxChars) {
        continuation(node, visitedNodes >= maxNodes ? "node-budget" : "text-budget",
          {childOffset: index});
        break;
      }
      walk(children[index], depth + 1, 0);
    }
  }
  for (const target of targets) walk(target, 0, textOffset);
  return {action: "read", pageId: page.id, targets: targets.map(metadata), textNodes,
    visitedNodes, characters, skippedHiddenNodeIds, truncated: continuations.length > 0,
    continuationNodeIds: [...new Set(continuations.map(item => item.nodeId))], continuations};
}
