// A throwaway file tree for the auto-skip tests: a fake home with a git repo,
// a scratchpad laid out like Claude Code's, files from "before the session"
// (birth time set to 2020) and files the session "created" (born now).
//
// It lives inside this folder (tests/.sandbox-*, ignored by git), not in the
// system temp folder, so nothing in it looks temporary by location alone.

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SESSION_ID = "0b6a4c7e-1111-4222-8333-944455556666";
const OLD = new Date("2020-01-01T00:00:00Z");

function write(file, text = "x\n", { old = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (old) {
    fs.utimesSync(file, OLD, OLD); // on APFS this moves the birth time back too
  }
}

function backdate(dir) {
  fs.utimesSync(dir, OLD, OLD);
}

export function buildSandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(HERE, ".sandbox-")));
  const home = path.join(root, "home");
  const repo = path.join(home, "code", "app");
  const scratch = path.join(root, "tmp", "claude-501", "-home-code-app", SESSION_ID, "scratchpad");
  const tmpdir = path.join(root, "var", "T");
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });

  // Before the session.
  for (const [file, text] of [
    ["src/index.php", "<?php echo 1;\n"],
    [".ai/skills/html-kit/SKILL.md", "# kit\n"],
    ["docs/_kit-preview/kit/kit.js", "export {}\n"],
    ["docs/_kit-preview/payments/confirm.md", "# confirm\n"],
    ["database/migrations/2026_01_01_000000_create_users.php", "<?php\n"],
    ["scripts/start", "#!/bin/sh\n"],
    ["config.yml", "debug: false\n"],
    [".gitignore", ["tmp/", "build/", "dist/", ".next/", "node_modules/", "vendor/", "storage/framework/cache/", "__pycache__/", ".pytest_cache/", "*.log", ".env", "data/", "out/", "out2/", "coverage/", ".terraform/", "target/", ".venv/", "*.sqlite", ".claude/settings.local.json", ""].join("\n")],
  ]) {
    write(path.join(repo, file), text, { old: true });
  }
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init");
  for (const file of [".env", "storage/app/backups/db-2026-10-01.sql.gz", "docs/drafts/plan.md", "docs/drafts/ideas.md", "notes/meeting-2026-10.md", "data/exports/customers.csv", "node_modules/left-pad/index.js",
    ".terraform/providers/registry/aws/x", "target/debug/app", ".venv/bin/python", "storage/app/uploads/u1/avatar.png",
    "deploy_ed25519", "docs/adr/0001-record.md", "photos/2024/IMG_0001.jpg", "database.sqlite", ".claude/settings.local.json"]) {
    write(path.join(repo, file), "old\n", { old: true });
  }
  write(path.join(home, "Downloads/report-final/report.pdf"), "pdf\n", { old: true });
  write(path.join(home, "app-migration/final/dump.sql"), "sql\n", { old: true });
  write(path.join(home, ".claude/projects/p/memory/do-it-yourself.md"), "note\n", { old: true });
  write(path.join(home, ".cache/pip/http/a"), "c\n", { old: true });
  write(path.join(home, "old.txt"), "keep\n", { old: true });
  write(path.join(home, "Library/Caches/com.example.tool/blob"), "c\n", { old: true });
  write(path.join(home, "projects-archive/2023/client-site/index.html"), "<html>\n", { old: true });

  // The session starts here.
  const startedAtMs = Date.now() - 2000;

  // Created by the session.
  for (const file of [
    "tmp/ev2.json", "tmp/ev6.json", "tmp/ev8.json", "tmp_install.log",
    "build/app.js", "dist/app.js", ".next/cache/x", "__pycache__/a.pyc", ".pytest_cache/v",
    "storage/framework/cache/data/ab/cd", "out/report.json", "src/feature/Feature.php", "reports/q3/summary.pdf",
    "coverage/index.html", "nohup.out", "src/index.php.orig", "src/index.php.rej",
  ]) {
    write(path.join(repo, file), "new\n");
  }
  // `Write` over an old file keeps its birth time.
  fs.appendFileSync(path.join(repo, "config.yml"), "debug: true\n");
  // `mv ~/old.txt out2/` from an earlier call: a new folder holding an old file.
  fs.mkdirSync(path.join(repo, "out2"));
  fs.renameSync(path.join(home, "old.txt"), path.join(repo, "out2/old.txt"));

  for (const file of ["dl/a.zip", "sl/repo/vendor/x", "sl/repo/node_modules/y", "sl/bin/z", "opcache/1", "partw-1.json", "kit/kit.js", "x/1", "cutover-dump.sh", "vm.env.orig"]) {
    write(path.join(scratch, file), "s\n");
  }
  fs.symlinkSync(repo, path.join(scratch, "link"));
  write(path.join(tmpdir, "tmp.x8Hq/a"), "t\n");
  backdate(path.join(home, "Downloads/report-final"));

  return {
    root,
    home,
    repo,
    scratch,
    tmpdir,
    startedAtMs,
    tmpRoot: `${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/tmp`,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** The test's stand-in for $.process.run: asynchronous, like the real one. */
export function run(argv, init = {}) {
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd: init.cwd, encoding: "utf8", timeout: init.timeoutMs ?? 15000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

/** Fills @HOME@, @REPO@, @SCR@ and @TMP@ in a case's text. */
export function fill(text, box) {
  return text.replaceAll("@HOME@", box.home).replaceAll("@REPO@", box.repo).replaceAll("@SCR@", box.scratch).replaceAll("@TMP@", box.tmpdir);
}
