#!/usr/bin/env python3
"""Build a portable local-marketplace zip; never publish or install it."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

from validate import ROOT, validate

FILES = {"README.md", "LICENSE", "AGENTS.md", "CHANGELOG.md"}
DIRECTORIES = {".codex-plugin", "skills", "references", "workflows", "evaluation", "templates", "scripts", "docs", "third-party", "tests"}


def package(destination, root=ROOT):
    root = Path(root).resolve()
    errors = validate(root)
    if errors:
        raise ValueError("Cannot package invalid plugin: " + "; ".join(errors))
    manifest = json.loads((root / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    folder = "design-harness-" + version.split("+", 1)[0]
    out = Path(destination).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    archive = out / (folder + ".zip")
    checksum = out / (folder + ".zip.sha256")
    if archive.exists() or checksum.exists():
        raise FileExistsError("Package already exists; use a fresh output directory")
    marketplace = {"name": "design-harness-team", "interface": {"displayName": "Design Harness Team"},
                   "plugins": [{"name": "design-harness", "source": {"source": "local", "path": "./plugins/design-harness"},
                                "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}, "category": "Productivity"}]}
    content = {folder + "/.agents/plugins/marketplace.json": (json.dumps(marketplace, ensure_ascii=False, indent=2) + "\n").encode()}
    for file in sorted(root.rglob("*")):
        relative = file.relative_to(root)
        if any(part in {"__pycache__", ".git", ".design-harness", "dist"} for part in relative.parts):
            continue
        if file.suffix in {".pyc", ".pyo"} or file.name == ".DS_Store":
            continue
        if relative.as_posix() not in FILES and relative.parts[0] not in DIRECTORIES:
            continue
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError("Do not package symlinked or external files: " + str(relative))
        if not file.is_file():
            continue
        content[folder + "/plugins/design-harness/" + relative.as_posix()] = file.read_bytes()
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as bundle:
        for name, data in sorted(content.items()):
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    with checksum.open("x", encoding="utf-8") as stream:
        stream.write(digest + "  " + archive.name + "\n")
    return {"archive": str(archive), "version": version, "sha256": digest, "files": len(content), "marketplace": "design-harness-team"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="dist")
    args = parser.parse_args()
    try:
        print(json.dumps(package(args.out), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
