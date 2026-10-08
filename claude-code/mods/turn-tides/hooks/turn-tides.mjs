// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Turn Tides: the tides of the session's turns, above the prompt — a
// companion chart to token-weather's context forecast.
//
// classic.SessionStart: seed the turn list from the transcript file, so a
// resumed session shows its history at once. classic.UserPromptSubmit: a
// plugin loaded mid-session missed the start, and the first prompt after
// that still names the transcript, so an empty list re-seeds there.
// session.append: each prompt the person typed becomes a turn.
// turn.complete: the turn's final visible text becomes its hover summary.
// ui.render (AbovePrompt): one line — a tide count, then one bar per turn
// whose width reads the answer's length (token-weather's history chart,
// horizontal). Hovering a bar unfolds that turn's question and answer
// summary above the strip; clicking it scrolls the transcript back to the
// turn's question.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const ANSWER_CAP = 240;

// Turns: { id, kind, text, answer, tokens, at }, oldest first — kind is 'ask' for a
// question with its answer, 'command' for a `!`-passthrough shell command the
// person ran; tokens is the turn's output tokens (what the bar reads).
// question with its answer, 'command' for a `!`-passthrough shell command the
// A module variable like
// token-weather's readings: a reload starts it over, and the next prompt's
// lazy seed fills it back in.
let turns = [];

// a fresh module copy re-seeds on the first prompt after it loads: an
// incremental list built by an older schema (turns recorded before the
// tokens field, say) would otherwise keep its stale widths forever; later
// prompts only re-seed when the strip stands empty
let seededThisCopy = false;

export function register(on) {
  on("classic.SessionStart", async ($, e, next) => {
    const result = await next(e);
    await seed($, e.transcript_path);
    return result;
  });

  on("classic.UserPromptSubmit", async ($, e, next) => {
    const result = await next(e);
    if (!seededThisCopy) {
      seededThisCopy = true;
      await seed($, e.transcript_path, true);
    } else if (turns.length === 0) {
      await seed($, e.transcript_path, true);
    }
    return result;
  });

  on("session.append", async ($, e, next) => {
    const result = await next(e);
    if (
      e.agentId === undefined &&
      (e.door === "prompt" || e.door === "command") &&
      e.message.type === "user" &&
      e.message.isMeta !== true
    ) {
      const text = textOf(e.message.content);
      // a !-passthrough command arrives wrapped in <bash-input>; a slash
      // command's echo in <command-name> stays out of the strip
      const kind = text.startsWith("<bash-input>") ? "command" : "ask";
      const body = kind === "command"
        ? (/^<bash-input>([\s\S]*?)<\/bash-input>/.exec(text)?.[1] ?? "").trim()
        : text;
      if ((kind === "ask" && isQuestionText(text) && !turns.some(turn => turn.id === e.uuid)) ||
          (kind === "command" && body !== "" && !turns.some(turn => turn.id === e.uuid))) {
        turns.push({ id: e.uuid, kind, text: body, answer: "", tokens: 0, at: Date.now() });
        $.ui.invalidate("ui.render");
      }
    }
    return result;
  });

  // the turn's own final text becomes the bar's hover summary; only the
  // last still-unanswered turn takes it, so continuations of a turn that
  // asked nothing change nobody's summary
  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId === undefined && e.answer !== "") {
      const last = turns[turns.length - 1];
      if (last && last.kind === "ask" && last.answer === "") {
        last.answer = oneLine(e.answer, ANSWER_CAP);
        last.tokens = e.usage?.output_tokens ?? 0;
        $.ui.invalidate("ui.render");
      }
    }
    return result;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.hasSurvey) {
      return next(e);
    }
    const { Box, Text, Button } = $.ui.resolve(e);
    const room = Math.max(4, Math.max(8, e.bodyColumns ?? 80) - 6);

    const summaries = turns.map((q, i) =>
      Box({
        key: `d:${q.id}`,
        display: "none",
        hover: { display: "flex", scope: `q:${q.id}` },
        backgroundColor: "#d0f0f4",
        flexDirection: "column",
        paddingX: 1,
        children: [
          Text({
            color: "black",
            children: [
              Text({ color: "black", bold: true, children: `#${i + 1}` }),
              ` ${q.kind === "command" ? "$ " : ""}${oneLine(q.text, room)}`,
            ],
          }),
          Text({
            color: "black",
            dimColor: true,
            children:
              (q.kind === "command"
                ? "! local command"
                : q.answer === ""
                  ? "A: …"
                  : `A: ${oneLine(q.answer, room)}`) +
              (q.kind === "ask" && q.tokens > 0 ? `  ↓${shortTokens(q.tokens)}` : ""),
          }),
        ],
      }),
    );

    const scaled = scaleStrip(turns, e.bodyColumns ?? 80);
    const strip = Box({
      flexDirection: "row",
      gap: scaled.gap,
      paddingX: 1,
      children: [
        Text({ color: "cyan", bold: true, children: `≋  ${turns.length}` }),
        Text({ dimColor: true, children: "tides" }),
        ...scaled.bars.map((q, i) =>
          Box({
            key: `b:${q.id}`,
            backgroundColor: q.kind === "command" ? "magenta" : "cyan",
            hover: { scope: `q:${q.id}` },
            children: [
              Button({
                key: `q:${q.id}`,
                plain: true,
                label: " ".repeat(scaled.widths[i]),
                onPress: () =>
                  void $.ui.scroll({ to: { requestId: q.id }, block: "start" }).catch(
                    () => undefined,
                  ),
              }),
            ],
          }),
        ),
      ],
    });

    const mine =
      turns.length === 0
        ? Text({ dimColor: true, children: "≋  Tides — awaiting the first turn" })
        : Box({ flexDirection: "column", children: [...summaries, strip] });

    // other band mods (token-weather, ...) draw beneath us; compose instead
    // of claiming the band alone
    const beneath = await next(e);
    return beneath ? Box({ flexDirection: "column", children: [mine, beneath] }) : mine;
  });
}

// Not every user-role row is a question the person typed: slash commands,
// local-command echoes and interruption markers ride the same door.
// the !-passthrough envelope is <bash-input> for the command line and
// <bash-stdout> for its output, two separate rows; only the input is a turn
function isLocalEcho(text) {
  return (
    text.startsWith("<command-name>") ||
    text.startsWith("<bash-") ||
    text.startsWith("<local-command")
  );
}

function isQuestionText(text) {
  return text !== "" && !text.startsWith("/") && !isLocalEcho(text) && !text.startsWith("[Request interrupted");
}

function textOf(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts = [];
  for (const block of content) {
    if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join(" ").trim();
}

// A transcript row's uuid is the id its render site draws under and what
// $.ui.scroll takes, so the seeded file and the live appends join on it.
// The assistant rows that follow a question become its answer summary: each
// one overwrites the last, so the row nearest the next question wins.
// merge: a tail-windowed re-seed refreshes what the window covers and keeps
// the turns before it; a session start still replaces wholesale
async function seed($, transcriptPath, merge = false) {
  if (transcriptPath === "") {
    return;
  }
  const file = await readTranscript($, transcriptPath);
  if (file === undefined) {
    return;
  }
  const found = [];
  for (const line of file.split("\n")) {
    if (line === "") {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue; // a partial first line of a tail lands here
    }
    if (row.type === "user" && row.isMeta !== true && row.isSidechain !== true) {
      const text = textOf(row.message?.content);
      if (isQuestionText(text)) {
        found.push({ id: row.uuid, kind: "ask", text, answer: "", tokens: 0, at: Date.parse(row.timestamp ?? "") || 0 });
        continue;
      }
      const command = /^<bash-input>([\s\S]*?)<\/bash-input>/.exec(text)?.[1]?.trim();
      if (command) {
        found.push({ id: row.uuid, kind: "command", text: command, answer: "", tokens: 0, at: Date.parse(row.timestamp ?? "") || 0 });
        continue;
      }
    }
    if (row.type === "assistant" && row.isSidechain !== true && found.length > 0 && found[found.length - 1].kind === "ask") {
      const text = oneLine(textOf(row.message?.content), ANSWER_CAP);
      if (text !== "") {
        found[found.length - 1].answer = text;
      }
      const out = row.message?.usage?.output_tokens;
      if (typeof out === "number") {
        found[found.length - 1].tokens += out;
      }
    }
  }
  if (!merge) {
    turns = found;
  } else {
    const byId = new Map(turns.map(q => [q.id, q]));
    for (const q of found) {
      byId.set(q.id, q);
    }
    turns = [...byId.values()].sort((a, b) => a.at - b.at);
  }
  $.ui.invalidate("ui.render");
}

// the whole file is preferred; a transcript past the 4 MiB read cap falls
// back to its last MiB through a host tail
async function readTranscript($, path) {
  const whole = await $.fs.read(path).catch(() => undefined);
  if (whole !== undefined) {
    return whole;
  }
  const tail = await $.process.run(["tail", "-c", "4194304", path]).catch(() => undefined);
  return tail === undefined || tail.exitCode !== 0 ? undefined : tail.stdout;
}

function oneLine(text, room) {
  const flat = text.replace(/\s+/g, " ");
  return flat.length > room ? flat.slice(0, Math.max(1, room - 1)) + "…" : flat;
}

// the strip never wraps and no turn is dropped: when the natural widths
// overflow the line, every bar scales by its share of the full budget
// (floored at one column, so the mapping stays monotone — longer answers
// stay visibly longer until the physics of the terminal runs out) and the
// bars touch like token-weather's chart. Only a turn count beyond the raw
// columns degenerates to the newest ones.
function scaleStrip(list, columns) {
  const budget = Math.max(24, Math.max(8, columns) - 14);
  const bars = list.length > budget ? list.slice(-budget) : list;
  const widths = rawWidths(bars);
  const sum = widths.reduce((a, b) => a + b, 0);
  const gaps = bars.length - 1;
  if (sum + gaps <= budget) {
    return { bars, widths, gap: 1 };
  }
  if (bars.length + gaps <= budget) {
    const k = (budget - gaps) / sum;
    return { bars, widths: widths.map(w => Math.max(1, Math.floor(w * k))), gap: 1 };
  }
  const k = budget / sum;
  return { bars, widths: widths.map(w => Math.max(1, Math.floor(w * k))), gap: 0 };
}

// a turn's bar width, token-weather's history chart turned horizontal: the
// longer the answer, the longer the bar; the running turn sits at a middle
// width until its answer lands
function shortTokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
}

// dynamic widths, token-weather's rule ("bars scale to the busiest reading
// shown, so growth shows at any fill level"): an ask's width spreads 2..5
// across the logarithm of its output tokens between the quietest and the
// busiest turns in view; ties stay ties, and the running turn matches the
// latest known one
function rawWidths(bars) {
  const known = bars.filter(q => q.kind === "ask" && q.tokens > 0).map(q => q.tokens);
  if (known.length === 0) return bars.map(q => (q.kind === "command" ? 1 : 3));
  const lo = Math.log(Math.min(...known));
  const hi = Math.log(Math.max(...known));
  const spread = hi - lo;
  const widthOf = t => (spread === 0 ? 3 : 2 + Math.round((3 * (Math.log(t) - lo)) / spread));
  let fallback = 3;
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].kind === "ask" && bars[i].tokens > 0) {
      fallback = widthOf(bars[i].tokens);
      break;
    }
  }
  return bars.map(q => (q.kind === "command" ? 1 : q.tokens > 0 ? widthOf(q.tokens) : fallback));
}
