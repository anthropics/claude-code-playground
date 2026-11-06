// Offline tests for auto-skip: no network, no model. Run from the mod folder:
//   node --test tests/autoskip.test.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { classify, classifyAll, register } from "../hooks/blast-radius.mjs";
import { evaluate, scratchPattern, settingsFrom } from "../hooks/autoskip.mjs";
import { CASES } from "./cases.mjs";
import { SESSION_ID, buildSandbox, fill, run } from "./sandbox.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let box;

before(() => {
  box = buildSandbox();
});
after(() => {
  box?.cleanup();
});

function ctxFor(c, mode, decide) {
  const history = (c.history ?? []).map((h) => fill(h, box)).join("\n");
  return {
    mode,
    threshold: 0.9,
    cwd: { repo: box.repo, home: box.home, scratch: box.scratch }[c.cwd],
    home: box.home,
    tmpdir: box.tmpdir,
    scratchRe: scratchPattern(SESSION_ID, box.tmpRoot),
    startedAtMs: box.startedAtMs,
    run,
    history: async () => history,
    decide,
  };
}

async function decideFor(c, mode, decide) {
  const command = fill(c.command, box);
  assert.notEqual(classify(command), null, `${c.id}: the mod should hold this command at all`);
  return evaluate(command, classifyAll(command), ctxFor(c, mode, decide));
}

describe("rules only", () => {
  for (const c of CASES) {
    test(`${c.id} -> ${c.rules}`, async () => {
      const verdict = await decideFor(c, "rules", () => assert.fail("the model must not be asked"));
      assert.equal(verdict.skip ? "skip" : "hold", c.rules, verdict.note ?? verdict.reason);
      if (c.label === "dangerous") {
        assert.equal(verdict.skip, false);
      }
    });
  }
});

describe("rules + model, with a model that always says yes", () => {
  for (const c of CASES) {
    test(`${c.id}: model ${c.asked ? "asked" : "not asked"}`, async () => {
      let asked = null;
      const verdict = await decideFor(c, "rules+model", (facts) => {
        asked = facts;
        return { p: 1 };
      });
      assert.equal(asked !== null, c.asked, verdict.note ?? verdict.reason);
      assert.equal(verdict.skip, c.rules === "skip" || c.asked);
      if (asked !== null) {
        const text = JSON.stringify(asked);
        assert.ok(!text.includes(box.home), "home is shown as ~");
        assert.ok(!/temporary scratch files this session/.test(text), "comments don't reach the model");
      }
    });
  }
});

describe("rules + model, with a model that says no or fails", () => {
  for (const answer of [{ p: 0.3 }, { error: "HTTP 500" }]) {
    test(`${JSON.stringify(answer)}: only the rules skip`, async () => {
      for (const c of CASES) {
        const verdict = await decideFor(c, "rules+model", () => answer);
        assert.equal(verdict.skip, c.rules === "skip", c.id);
      }
    });
  }
});

describe("facts", () => {
  test("created after the session started, by birth time", async () => {
    const seen = {};
    for (const id of ["t08-generated-by-script", "t22-drafts", "t27-moved-old-file"]) {
      await decideFor(CASES.find((c) => c.id === id), "rules+model", (facts) => {
        seen[id] = facts.paths[0];
        return { p: 0 };
      });
    }
    assert.equal(seen["t08-generated-by-script"].created_after_session_start, true);
    assert.equal(seen["t08-generated-by-script"].mentioned_earlier_in_session, true);
    assert.equal(seen["t22-drafts"].created_after_session_start, false);
    assert.equal(seen["t27-moved-old-file"].created_after_session_start, false, "mv keeps the old birth time");
  });

  test("a folder that is a git checkout says whether it could be cloned again", async () => {
    const seen = {};
    for (const id of ["s19-own-clone", "t31-clone-with-uncommitted-fix", "t32-clone-with-unpushed-commit"]) {
      await decideFor(CASES.find((c) => c.id === id), "rules+model", (facts) => {
        seen[id] = facts.paths[0];
        return { p: 0 };
      });
    }
    assert.deepEqual(seen["s19-own-clone"].git_checkout, { has_remote: true, uncommitted_changes: 0, unpushed_commits: 0, stashes: 0 });
    assert.ok(!seen["s19-own-clone"].sample_files.some((name) => name.startsWith(".git/")), "no .git internals in the sample");
    assert.equal(seen["t31-clone-with-uncommitted-fix"].git_checkout.uncommitted_changes, 1);
    assert.equal(seen["t32-clone-with-unpushed-commit"].git_checkout.unpushed_commits, 1);
    assert.equal(seen["t32-clone-with-unpushed-commit"].git_checkout.uncommitted_changes, 0);
  });

  test("remote paths are described as remote and not resolved", async () => {
    let facts;
    await decideFor(CASES.find((c) => c.id === "s17-remote-acme-probe"), "rules+model", (f) => {
      facts = f;
      return { p: 0 };
    });
    assert.match(facts.where, /remote/);
    assert.equal(facts.paths.length, 0);
    assert.equal(facts.paths_not_resolved[0].written_as, "/srv/app/current/public/.well-known/acme-challenge/probe-123");
  });
});

describe("settings", () => {
  test("off unless asked", () => {
    assert.equal(settingsFrom({}).mode, "off");
    assert.equal(settingsFrom({ autoSkip: "yes" }).mode, "off");
    assert.equal(settingsFrom({ autoSkip: "rules+model" }).mode, "rules+model");
  });
  test("caution names and numbers", () => {
    assert.equal(settingsFrom({ caution: "low" }).threshold, 0.8);
    assert.equal(settingsFrom({ caution: "high" }).threshold, 0.97);
    assert.equal(settingsFrom({ caution: "0.95" }).threshold, 0.95);
    assert.equal(settingsFrom({ caution: "lots" }).threshold, 0.9);
  });
});

describe("autoSkip off is the old mod", () => {
  test("classify() reads every case as the version before auto-skip does", async () => {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: HERE, encoding: "utf8" }).trim();
    const rel = path.relative(root, path.join(HERE, "../hooks/blast-radius.mjs"));
    // The commit that added autoskip.mjs; its parent holds the mod as it was.
    const added = execFileSync("git", ["log", "--format=%H", "--diff-filter=A", "-1", "--", path.join(HERE, "../hooks/autoskip.mjs")], { cwd: root, encoding: "utf8" }).trim();
    const old = execFileSync("git", ["show", `${added ? `${added}^` : "HEAD"}:${rel}`], { cwd: root, encoding: "utf8" });
    const file = path.join(box.root, "old-blast-radius.mjs");
    fs.writeFileSync(file, /export function classify\b/.test(old) ? old : `${old}\nexport { classify };\n`);
    const { classify: oldClassify } = await import(file);
    for (const c of CASES) {
      const command = fill(c.command, box);
      assert.deepEqual(classify(command), oldClassify(command), c.id);
    }
  });

  test("the hook holds a scratchpad rm without looking at it", async () => {
    const calls = [];
    const hook = hookOf({});
    const result = await hook(fake$(calls), { command: `rm -rf ${box.scratch}/dl`, tool_use_id: "t1" }, abortedNext());
    assert.match(result.deny, /turn was interrupted/);
    assert.ok(calls.includes("ui.open"));
    assert.ok(!calls.includes("session.id"), "auto-skip never ran");
  });

  test("with autoSkip=rules an rm of nothing runs without the pane", async () => {
    const calls = [];
    const hook = hookOf({ autoSkip: "rules" });
    const ran = [];
    const next = (e) => {
      ran.push(e.command);
      return { ok: true };
    };
    next.signal = { aborted: false };
    await hook(fake$(calls), { command: `rm -rf ${box.scratch}/not-there`, tool_use_id: "t1" }, next);
    assert.equal(ran.length, 1);
    assert.ok(!calls.includes("ui.open"));
    assert.ok(calls.some((c) => c.startsWith("toast:")));
    assert.ok(calls.some((c) => c.startsWith("log:Blast Radius: ran without the pane, nothing to delete: rm -rf ")));
  });

  test("an rm of what the same command makes says so, not 'nothing to delete'", async () => {
    const calls = [];
    const hook = hookOf({ autoSkip: "rules" });
    const next = () => ({ ok: true });
    next.signal = { aborted: false };
    const command = `D=${box.scratch}/made-here; mkdir -p "$D/sub" && touch "$D/sub/f.txt" && rm -rf "$D"`;
    await hook(fake$(calls), { command, tool_use_id: "t1" }, next);
    assert.ok(calls.some((c) => c.startsWith("log:Blast Radius: ran without the pane, it deletes only what the same command makes first: ")), calls.join("\n"));
  });

  test("with autoSkip=rules a held rm says why in the transcript", async () => {
    const calls = [];
    const hook = hookOf({ autoSkip: "rules" });
    const result = await hook(fake$(calls), { command: "rm -rf src", tool_use_id: "t1" }, abortedNext());
    assert.ok(result.deny);
    const line = calls.find((c) => c.startsWith("log:"));
    assert.match(line, /^log:Blast Radius: held for the pane, .*outside this session's scratchpad: rm -rf src$/);
  });

  test("with autoSkip=off nothing is written to the transcript", async () => {
    const calls = [];
    const hook = hookOf({});
    await hook(fake$(calls), { command: "rm -rf src", tool_use_id: "t1" }, abortedNext());
    assert.ok(!calls.some((c) => c.startsWith("log:")));
  });
});

function hookOf(options) {
  let hook;
  register((event, matcher, fn) => {
    if (event === "tool.call") {
      hook = fn;
    }
  }, options);
  return hook;
}

function abortedNext() {
  const next = () => assert.fail("must not run");
  next.signal = { aborted: false };
  setTimeout(() => {
    next.signal.aborted = true;
  }, 50);
  return next;
}

function fake$(calls) {
  return {
    process: { run },
    session: {
      cwd: async () => box.repo,
      id: async () => {
        calls.push("session.id");
        return SESSION_ID;
      },
      usage: async () => ({ startedAt: box.startedAtMs }),
      messages: async () => [],
    },
    clock: { now: async () => Date.now() },
    ui: {
      open: async () => {
        calls.push("ui.open");
        return { isPlaced: true };
      },
      close: async () => {},
      invalidate: () => {},
      toast: (text) => calls.push(`toast:${text}`),
      log: (text) => calls.push(`log:${text}`),
    },
    http: { fetch: async () => assert.fail("no network in offline tests") },
  };
}
