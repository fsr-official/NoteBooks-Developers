import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FmtreeTests(unittest.TestCase):
    def test_includes_built_html_metadata_and_excludes_development_sources(self):
        with tempfile.TemporaryDirectory(prefix="notebooks-fmtree-") as directory:
            repository = Path(directory) / "repository"
            html_path = repository / "AI-NOTES" / "chapter.html"
            source_path = "src/AI-NOTES/chapter/chapter-NOTES.mdx"
            html_path.parent.mkdir(parents=True)
            (repository / "src").mkdir()
            (repository / "utils").mkdir()
            (repository / "runtime").mkdir()
            (repository / "showcase").mkdir()
            (repository / "src" / "private.mdx").write_text("private", encoding="utf-8")
            (repository / "utils" / "compiler.py").write_text("compiler", encoding="utf-8")
            (repository / "runtime" / "README.md").write_text("runtime source", encoding="utf-8")
            (repository / "showcase" / "index.html").write_text("temporary showcase", encoding="utf-8")
            (repository / "README.md").write_text("Reader", encoding="utf-8")
            html_path.write_text('<article data-renderer-version="0.2.5"></article>', encoding="utf-8")
            (repository / "AI-NOTES" / "untracked.html").write_text("not built", encoding="utf-8")
            (repository / "manifest.json").write_text(
                json.dumps({
                    "rendererVersion": "0.2.5",
                    "files": {
                        "AI-NOTES/chapter.html": {
                            "kind": "chapter",
                            "FilePaths": [source_path],
                            "FileSHAs": {"notes": "a" * 64},
                        },
                    },
                }),
                encoding="utf-8",
            )
            subprocess.run(["git", "init", "-q", str(repository)], check=True)
            output = Path(directory) / "files.json"
            subprocess.run(
                [sys.executable, str(ROOT / "fmtree.py"), "--root", str(repository), "--out", str(output)],
                check=True,
                capture_output=True,
                text=True,
            )

            payload = json.loads(output.read_text(encoding="utf-8"))
            files = {}

            def visit(node):
                if node.get("type") == "file":
                    files[node["path"]] = node
                for child in node.get("children", []):
                    visit(child)

            visit(payload)

            self.assertIn("AI-NOTES/chapter.html", files)
            self.assertEqual(files["AI-NOTES/chapter.html"]["mime"], "text/html")
            self.assertEqual(files["AI-NOTES/chapter.html"]["RendererVersion"], "0.2.5")
            self.assertEqual(
                files["AI-NOTES/chapter.html"]["SourceFiles"],
                {"SourcePath": [source_path], "SourceSHAs": {"notes": "a" * 64}},
            )
            self.assertNotIn("AI-NOTES/untracked.html", files)
            self.assertNotIn("src/private.mdx", files)
            self.assertNotIn("utils/compiler.py", files)
            self.assertNotIn("runtime/README.md", files)
            self.assertNotIn("showcase/index.html", files)


if __name__ == "__main__":
    unittest.main()
