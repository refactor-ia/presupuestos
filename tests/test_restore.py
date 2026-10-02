import os
import shlex
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODELS = ("claude", "codex", "deepseek", "glm", "kimi", "mimo", "minimax", "nan")
INPUTS = (
    Path("KICKSTART.md"),
    Path("constitution.md"),
    Path("design.md"),
    Path("evaluation.md"),
    Path("specs/app-presupuestos.yaml"),
    Path("plans/app-presupuestos.yaml"),
)


class RestoreScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.fixture = Path(self.temp.name)
        self.root = self.fixture / "repository"
        self.root.mkdir()
        self.sibling = self.fixture / "external-sibling"
        self.sibling.mkdir()
        self._write(self.sibling / "sentinel", "outside repository\n")
        source = Path(__file__).resolve().parents[1] / "restore.sh"
        self.assertFalse(self.fixture.resolve().is_relative_to(source.parent),
                         "temporary fixture must be outside the live repository")
        self.assertTrue(source.is_file(), "fixture source restore.sh is required")
        self.script = self.root / "restore.sh"
        shutil.copy2(source, self.script)
        self.live_script = source.resolve()
        self._assert_isolated_script()
        self._seed_canon()
        self._write(self.root / "protected-root-data", "must survive\n")
        for model in MODELS:
            self._seed_model(model)

    def _write(self, path, contents):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding="utf-8")

    def _seed_canon(self):
        for item in INPUTS:
            self._write(self.root / ".ai" / item, f"canonical {item}\n")
        self._write(self.root / ".ai" / ".root-hidden", "canonical only\n")
        self._write(self.root / ".ai" / "private" / "note", "preserve this\n")

    def _seed_model(self, model):
        self._write(self.root / model / ".ai" / "stale", f"old {model}\n")
        self._write(self.root / model / ".hidden-generated", "old hidden\n")
        self._write(self.root / model / "generated-output", "old output\n")
        self._write(self.root / model / "README.md", "old readme\n")
        self._write(self.root / model / "AGENTS.md", "old agent link\n")

    def _assert_isolated_script(self):
        try:
            self.script.resolve().relative_to(self.fixture.resolve())
        except ValueError:
            self.fail("restore invocation must be inside the temporary fixture")
        self.assertNotEqual(self.script.resolve(), self.live_script)

    def _run(self, *args, stdin="", cwd=None):
        self._assert_isolated_script()
        return subprocess.run(
            ["bash", str(self.script), *args],
            cwd=cwd or self.root,
            input=stdin,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )

    def _snapshot(self, *roots):
        result = {}

        def visit(path, label):
            if path.is_symlink():
                result[label] = ("link", os.readlink(path))
            elif path.is_dir():
                result[label] = ("dir",)
                for child in sorted(path.iterdir(), key=lambda item: item.name):
                    visit(child, f"{label}/{child.name}")
            elif path.is_file():
                result[label] = ("file", path.read_bytes())
            else:
                result[label] = ("other",)

        for root in roots:
            visit(root, root.name)
        return result

    def _assert_successful_reset(self):
        canonical = self.root / ".ai"
        inodes = []
        for model in MODELS:
            with self.subTest(model=model):
                target = self.root / model
                self.assertEqual({entry.name for entry in target.iterdir()},
                                 {".ai", "AGENTS.md", "README.md"})
                self.assertFalse((target / ".hidden-generated").exists())
                self.assertTrue((target / "AGENTS.md").is_symlink())
                self.assertEqual(".ai/KICKSTART.md", os.readlink(target / "AGENTS.md"))
                readme = (target / "README.md").read_text(encoding="utf-8").lower()
                for evidence in (model, "pendiente", "v4", "draft", ".ai/kickstart.md"):
                    self.assertIn(evidence, readme)
                for item in INPUTS:
                    copied = target / ".ai" / item
                    source = canonical / item
                    self.assertTrue(copied.is_file())
                    self.assertFalse(copied.is_symlink())
                    self.assertEqual(source.read_bytes(), copied.read_bytes())
                    self.assertNotEqual(os.stat(source).st_ino, os.stat(copied).st_ino)
                    inodes.append(os.stat(copied).st_ino)
        self.assertEqual(len(inodes), len(set(inodes)), "inputs may not hard-link peers")

    def test_confirmed_reset_replaces_all_eight_models_and_preserves_root(self):
        preserved = self._snapshot(self.root / ".ai", self.root / "protected-root-data", self.sibling)
        result = self._run(stdin="admin\n")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(preserved, self._snapshot(self.root / ".ai", self.root / "protected-root-data", self.sibling))
        self._assert_successful_reset()

    def test_confirmed_reset_is_idempotent(self):
        self.assertEqual(0, self._run(stdin="admin\n").returncode)
        first = self._snapshot(self.root)
        second = self._run(stdin="admin\n")
        self.assertEqual(0, second.returncode, second.stderr)
        self.assertEqual(first, self._snapshot(self.root))

    def test_failed_install_preserves_staged_original_when_target_is_occupied(self):
        original_payload = "unique original claude payload\n"
        self._write(self.root / "claude" / "generated-output", original_payload)
        preserved = self._snapshot(self.root / ".ai", self.root / "protected-root-data", self.sibling)
        other_models = self._snapshot(*(self.root / model for model in MODELS if model != "claude"))
        real_mv = shutil.which("mv")
        self.assertIsNotNone(real_mv)
        wrapper_dir = self.fixture / "mv-wrapper"
        wrapper_dir.mkdir()
        wrapper = wrapper_dir / "mv"
        wrapper.write_text(
            "#!/usr/bin/env bash\n"
            f"fixture_root={shlex.quote(str(self.root))}\n"
            f"real_mv={shlex.quote(real_mv)}\n"
            "if [[ \"$#\" -eq 4 && \"$1\" == '-T' && \"$2\" == '--' "
            "&& \"$3\" == \"$fixture_root\"/.restore-stage.*/prepared/claude "
            "&& \"$4\" == \"$fixture_root/claude\" ]]; then\n"
            "  mkdir -p -- \"$4\"\n"
            "  printf '%s\\n' 'unexpected occupant' > \"$4/occupant\"\n"
            "  exit 72\n"
            "fi\n"
            "exec \"$real_mv\" \"$@\"\n",
            encoding="utf-8",
        )
        wrapper.chmod(0o755)

        with patch.dict(os.environ, {"PATH": f"{wrapper_dir}{os.pathsep}{os.environ['PATH']}"}):
            result = self._run(stdin="admin\n")

        self.assertNotEqual(0, result.returncode)
        self.assertEqual(preserved, self._snapshot(self.root / ".ai", self.root / "protected-root-data", self.sibling))
        self.assertEqual(other_models, self._snapshot(*(self.root / model for model in MODELS if model != "claude")))
        self.assertEqual("unexpected occupant\n", (self.root / "claude" / "occupant").read_text(encoding="utf-8"))
        payloads = [
            path for path in self.fixture.rglob("generated-output")
            if path.is_file() and not path.is_symlink() and path.read_text(encoding="utf-8") == original_payload
        ]
        self.assertEqual(1, len(payloads), "the original Claude payload must remain available for recovery")

    def test_confirmed_reset_creates_an_absent_model(self):
        shutil.rmtree(self.root / "nan")
        result = self._run(stdin="admin\n")
        self.assertEqual(0, result.returncode, result.stderr)
        self._assert_successful_reset()

    def test_script_derives_root_from_its_own_location(self):
        result = self._run(stdin="admin\n", cwd=self.sibling)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("outside repository\n", (self.sibling / "sentinel").read_text())
        self._assert_successful_reset()

    def test_dry_run_is_non_mutating_and_lists_all_targets(self):
        before = self._snapshot(self.root, self.sibling)
        result = self._run("--dry-run", stdin="admin\n")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(before, self._snapshot(self.root, self.sibling))
        for model in MODELS:
            self.assertIn(model, result.stdout)

    def test_help_succeeds_without_a_valid_canon(self):
        shutil.rmtree(self.root / ".ai")
        result = self._run("--help")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertRegex((result.stdout + result.stderr).lower(), r"\b(?:uso|usage)\b")

    def test_decline_and_eof_cancel_without_mutation(self):
        for stdin in ("no\n", ""):
            with self.subTest(stdin=repr(stdin)):
                before = self._snapshot(self.root, self.sibling)
                result = self._run(stdin=stdin)
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(before, self._snapshot(self.root, self.sibling))

    def test_legacy_and_unknown_arguments_are_rejected_without_mutation(self):
        (self.root / ".backup-legacy" / ".ai").mkdir(parents=True)
        for args in ((".backup-legacy",), ("--unexpected",)):
            with self.subTest(args=args):
                before = self._snapshot(self.root, self.sibling)
                result = self._run(*args, stdin="admin\n")
                self.assertNotEqual(0, result.returncode)
                self.assertEqual(before, self._snapshot(self.root, self.sibling))

    def test_missing_late_canonical_input_prevents_every_reset(self):
        (self.root / ".ai" / INPUTS[-1]).unlink()
        before = self._snapshot(self.root, self.sibling)
        result = self._run(stdin="admin\n")
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(before, self._snapshot(self.root, self.sibling))

    def test_symlinked_canonical_directory_or_input_is_rejected(self):
        for unsafe in ("directory", "input"):
            with self.subTest(unsafe=unsafe):
                if unsafe == "directory":
                    real = self.root / "real-canon"
                    (self.root / ".ai").rename(real)
                    (self.root / ".ai").symlink_to(real, target_is_directory=True)
                else:
                    source = self.root / ".ai" / "KICKSTART.md"
                    source.unlink()
                    source.symlink_to(self.sibling / "sentinel")
                before = self._snapshot(self.root, self.sibling)
                result = self._run(stdin="admin\n")
                self.assertNotEqual(0, result.returncode)
                self.assertEqual(before, self._snapshot(self.root, self.sibling))
                if unsafe == "directory":
                    (self.root / ".ai").unlink()
                    real.rename(self.root / ".ai")
                else:
                    source.unlink()
                    self._write(source, "canonical KICKSTART.md\n")

    def test_late_unsafe_target_entry_prevents_every_reset(self):
        target = self.root / "nan"
        for kind in ("symlink", "broken-link", "file"):
            with self.subTest(kind=kind):
                shutil.rmtree(target)
                if kind == "symlink":
                    target.symlink_to(self.sibling, target_is_directory=True)
                elif kind == "broken-link":
                    target.symlink_to(self.root / "missing-target")
                else:
                    self._write(target, "not a directory\n")
                before = self._snapshot(self.root, self.sibling)
                result = self._run(stdin="admin\n")
                self.assertNotEqual(0, result.returncode)
                self.assertEqual(before, self._snapshot(self.root, self.sibling))
                if target.is_symlink() or target.is_file():
                    target.unlink()
                else:
                    shutil.rmtree(target)
                self._seed_model("nan")


if __name__ == "__main__":
    unittest.main()
