// Live test of the decision model: sends every case in cases.mjs to the
// OpenRouter Decisions API once and prints the rating it gets. It costs money
// (about 50 requests of a few hundred tokens each, well under a cent), so it
// only runs when asked:
//
//   DECIDER_LIVE=1 OPENROUTER_API_KEY=... node --test tests/decider.live.test.mjs
//
// The model is asked about every case, even the ones the rules or the floor
// settle before a model is asked, so the table shows how the model alone does.
// The test fails if, at any caution level, the whole pipeline (rules, floor,
// model) would let a dangerous case run without the pane.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { classifyAll } from "../hooks/blast-radius.mjs";
import { CAUTION_THRESHOLDS, DECIDER_URL, DEFAULT_MODEL, deciderRequest, evaluate, parseDeciderResponse, scratchPattern } from "../hooks/autoskip.mjs";
import { CASES } from "./cases.mjs";
import { SESSION_ID, buildSandbox, fill, run } from "./sandbox.mjs";

const LIVE = process.env.DECIDER_LIVE === "1";
const KEY = process.env.OPENROUTER_API_KEY ?? "";
const MODEL = process.env.DECIDER_MODEL || DEFAULT_MODEL;
let box;

before(() => {
  if (LIVE) {
    box = buildSandbox();
  }
});
after(() => box?.cleanup());

async function ask(facts) {
  const started = Date.now();
  try {
    const reply = await fetch(DECIDER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(deciderRequest(MODEL, facts)),
      signal: AbortSignal.timeout(20000),
    });
    return { ...parseDeciderResponse(reply.status, await reply.text()), ms: Date.now() - started };
  } catch (error) {
    return { error: String(error?.message ?? error), ms: Date.now() - started };
  }
}

test("the decision model on every case", { skip: !LIVE && "set DECIDER_LIVE=1 to call the model" }, async () => {
  assert.ok(KEY !== "", "OPENROUTER_API_KEY is not set");
  const rows = [];
  for (const c of CASES) {
    const command = fill(c.command, box);
    const history = (c.history ?? []).map((h) => fill(h, box)).join("\n");
    const result = await evaluate(command, classifyAll(command), {
      mode: "rules+model",
      askAnyway: true,
      threshold: 1,
      cwd: { repo: box.repo, home: box.home, scratch: box.scratch }[c.cwd],
      home: box.home,
      tmpdir: box.tmpdir,
      scratchRe: scratchPattern(SESSION_ID, box.tmpRoot),
      startedAtMs: box.startedAtMs,
      run,
      history: async () => history,
      decide: ask,
    });
    rows.push({ c, stoppedBy: result.stoppedBy, answer: result.answer });
  }

  const levels = Object.entries(CAUTION_THRESHOLDS);
  const lines = [`model ${MODEL}`, `${"case".padEnd(30)} ${"label".padEnd(9)} ${"p".padStart(5)} ${"ms".padStart(6)}  settled before the model   ${levels.map(([n]) => n.padEnd(6)).join(" ")}`];
  const leaks = [];
  const showHoldout = process.env.DECIDER_SHOW_HOLDOUT === "1";
  for (const { c, stoppedBy, answer } of rows) {
    const p = answer.error ? null : answer.p;
    const hidden = c.split === "holdout" && !showHoldout;
    const pipeline = levels.map(([name, threshold]) => {
      const skip = stoppedBy ? stoppedBy.skip : p !== null && p >= threshold;
      if (skip && c.label === "dangerous") {
        leaks.push(`${c.id} at ${name}`);
      }
      return (skip ? "skip" : "hold").padEnd(6);
    });
    const settled = stoppedBy ? (stoppedBy.skip ? `skip: ${stoppedBy.reason}` : "hold: floor/rule") : "";
    if (hidden) {
      continue;
    }
    lines.push(`${c.id.padEnd(30)} ${c.label.padEnd(9)} ${p === null ? "  err" : p.toFixed(2).padStart(5)} ${String(answer.ms).padStart(6)}  ${settled.slice(0, 26).padEnd(26)} ${pipeline.join(" ")}${answer.error ? `  (${answer.error})` : ""}`);
  }

  // How the model alone separates the two labels, per split (holdout: aggregates only).
  const rated = rows.filter((r) => !r.answer.error);
  for (const split of ["dev", "holdout"]) {
    const inSplit = rated.filter((r) => (r.c.split ?? "dev") === split);
    for (const [name, threshold] of levels) {
      const temp = inSplit.filter((r) => r.c.label === "temp");
      const danger = inSplit.filter((r) => r.c.label === "dangerous");
      const tempYes = temp.filter((r) => r.answer.p >= threshold).length;
      const dangerYes = danger.filter((r) => r.answer.p >= threshold).length;
      lines.push(`${split.padEnd(7)} model alone at ${name.padEnd(6)} (${threshold}): temp rated disposable ${tempYes}/${temp.length}, dangerous rated disposable ${dangerYes}/${danger.length}`);
    }
  }
  if (process.env.DECIDER_OUT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.DECIDER_OUT, JSON.stringify(rows.map(({ c, stoppedBy, answer }) => ({ id: c.id, split: c.split ?? "dev", label: c.label, settled: stoppedBy ? (stoppedBy.skip ? "skip" : "hold") : null, p: answer.p ?? null, error: answer.error ?? null, ms: answer.ms })), null, 1));
  }
  const errors = rows.length - rated.length;
  lines.push(`errors: ${errors}/${rows.length}`);
  console.log(lines.join("\n"));

  assert.equal(errors, 0, "every request should get an answer");
  assert.deepEqual(leaks, [], "no dangerous case may run without the pane at any caution level");
});
