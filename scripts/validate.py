#!/usr/bin/env python3
"""Portable, offline consistency checks for this plugin's distribution contract."""
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def validate(root=ROOT):
    errors = []

    def check(condition, message):
        if not condition:
            errors.append(message)

    manifest = json.loads((root / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    source_layout = manifest.get("name") == root.name
    cache_layout = root.parent.name == manifest.get("name") and root.name == manifest.get("version")
    check(source_layout or cache_layout, "Expected source plugin folder or Codex versioned cache layout")
    check(manifest.get("skills") == "./skills/", "Skills must be declared")
    check(bool(re.fullmatch(r"\d+\.\d+\.\d+(?:\+[A-Za-z0-9.-]+)?", manifest.get("version", ""))), "Invalid version")
    for field in ("description", "author", "interface"):
        check(bool(manifest.get(field)), f"Missing manifest {field}")
    prompts = manifest.get("interface", {}).get("defaultPrompt", [])
    check(isinstance(prompts, list) and 1 <= len(prompts) <= 3 and all(isinstance(p, str) and len(p) <= 128 for p in prompts), "Invalid defaultPrompt")
    check(not any(key in manifest for key in ("hooks", "mcpServers", "apps")), "v0.1 is skills-only")

    skills = list((root / "skills").glob("*/SKILL.md"))
    check({path.parent.name for path in skills} == {"design-harness-init", "design-harness-design"}, "Expected only Init and Design public skills")
    for path in skills:
        content = path.read_text(encoding="utf-8")
        front = re.match(r"\A---\n(.*?)\n---\n", content, re.S)
        check(front is not None, f"Missing frontmatter: {path}")
        if front:
            check(f"name: {path.parent.name}\n" in front[1] + "\n", f"Skill name mismatch: {path}")
            check(bool(re.search(r"^description: .+", front[1], re.M)), f"Missing trigger description: {path}")
        check(len(content.splitlines()) < 200, f"Skill entrypoint too long: {path}")
        metadata = path.parent / "agents/openai.yaml"
        check(metadata.is_file(), f"Missing discovery metadata: {metadata}")
        if metadata.is_file():
            check("$" + path.parent.name in metadata.read_text(encoding="utf-8"), f"Prompt must invoke skill: {metadata}")

    for path in root.rglob("*.md"):
        if any(part in {".git", "dist", ".design-harness"} for part in path.relative_to(root).parts):
            continue
        content = path.read_text(encoding="utf-8")
        for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", link) or link.startswith("#"):
                continue
            relative = unquote(link.split("#", 1)[0].strip("<>"))
            if relative:
                target = (path.parent / relative).resolve()
                check(target.is_relative_to(root.resolve()) and target.exists(), f"Broken/nonportable link in {path.relative_to(root)}: {link}")

    for required in ("workflows/init.md", "workflows/design.md", "evaluation/checks.md",
                     "scripts/figma-reader.js", "templates/harness-entry.txt",
                     "templates/module-overview.txt", "templates/resource-card.txt",
                     "templates/requirement-page.txt", "templates/writeback-delta.txt"):
        check((root / required).is_file(), f"Missing workflow resource: {required}")

    lock = json.loads((root / "third-party/upstream-lock.json").read_text(encoding="utf-8"))
    for source in lock["sources"]:
        check(bool(re.fullmatch(r"[0-9a-f]{40}", source["commit"])), "Upstream must be pinned to a commit")
        for item in source["bundledFiles"]:
            path = root / item["path"]
            check(path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"], f"License/notice hash mismatch: {path}")
        for item in source["sourceFiles"]:
            check(bool(re.fullmatch(r"[0-9a-f]{64}", item["sha256"])), "Missing original source hash")
        for adapted in source.get("adaptedInto", []):
            check((root / adapted).is_file(), f"Missing attributed adaptation: {adapted}")
    return errors


def main():
    try:
        errors = validate()
    except (OSError, ValueError, KeyError, TypeError) as error:
        errors = [str(error)]
    if errors:
        print("Validation failed:\n" + "\n".join("- " + item for item in errors))
        return 1
    print("Two-skill plugin structure, workflow resources, links and upstream notices validated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
