import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from package_plugin import package
from validate import validate


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="design-harness-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "source" / "design-harness"
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns(".git", "dist", "__pycache__", "*.pyc", ".DS_Store"))

    def test_valid_source_and_versioned_cache(self):
        self.assertEqual(validate(self.root), [])
        version = json.loads((self.root / ".codex-plugin/plugin.json").read_text())["version"]
        cache = self.base / "cache" / "design-harness" / version
        shutil.copytree(self.root, cache)
        self.assertEqual(validate(cache), [])

    def test_packaged_marketplace_is_portable_and_validates_after_extraction(self):
        result = package(self.base / "out", self.root)
        archive = Path(result["archive"])
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), result["sha256"])
        extracted = self.base / "new location"
        with zipfile.ZipFile(archive) as bundle:
            self.assertTrue(all(not Path(name).is_absolute() and ".." not in Path(name).parts for name in bundle.namelist()))
            bundle.extractall(extracted)
        market_root = extracted / archive.stem
        market = json.loads((market_root / ".agents/plugins/marketplace.json").read_text())
        plugin = market_root / market["plugins"][0]["source"]["path"]
        self.assertEqual(market["name"], "design-harness-team")
        self.assertEqual(validate(plugin), [])
        process = subprocess.run([sys.executable, "scripts/validate.py"], cwd=plugin, capture_output=True, text=True)
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
        self.assertEqual({p.name for p in (plugin / "skills").iterdir()}, {"design-harness-init", "design-harness-design"})

    def test_builds_are_deterministic_and_refuse_overwrite(self):
        first = package(self.base / "one", self.root)
        second = package(self.base / "two", self.root)
        self.assertEqual(first["sha256"], second["sha256"])
        with self.assertRaises(FileExistsError):
            package(self.base / "one", self.root)

    def test_distribution_excludes_working_data_and_generated_files(self):
        marker = ("private-fixture-" + self.base.name).encode()
        for relative in ["dist/old.zip", ".design-harness/private.txt", "scripts/__pycache__/old.pyc", ".git/local", "local-note.txt"]:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(marker)
        result = package(self.base / "out", self.root)
        with zipfile.ZipFile(result["archive"]) as bundle:
            self.assertFalse(any(marker in bundle.read(name) for name in bundle.namelist()))

    def test_distribution_rejects_symlink_files_and_directories(self):
        for target in [self.base / "outside.txt", self.base / "outside-dir"]:
            if target.suffix:
                target.write_text("outside fixture")
            else:
                target.mkdir()
            link = self.root / "references" / target.name
            link.symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlinked"):
                package(self.base / "out", self.root)
            link.unlink()

    def test_broken_internal_reference_is_detected(self):
        with (self.root / "README.md").open("a") as output:
            output.write("\n[broken](references/missing.md)\n")
        self.assertTrue(any("Broken/nonportable" in error for error in validate(self.root)))

    def test_modified_license_is_detected(self):
        with (self.root / "third-party/impeccable/LICENSE").open("a") as output:
            output.write("altered fixture")
        self.assertTrue(any("hash mismatch" in error for error in validate(self.root)))

    def test_missing_skill_or_workflow_asset_prevents_packaging(self):
        for relative in ["skills/design-harness-init/SKILL.md", "templates/harness-entry.txt"]:
            target = self.root / relative
            content = target.read_bytes()
            target.unlink()
            with self.assertRaisesRegex(ValueError, "invalid plugin"):
                package(self.base / "out", self.root)
            target.write_bytes(content)


if __name__ == "__main__":
    unittest.main()
