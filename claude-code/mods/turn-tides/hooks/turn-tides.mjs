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

// Turns: { id, text, answer, at }, oldest first. A module variable like
// token-weather's readings: a reload starts it over, and the next prompt's
// lazy seed fills it back in.
let turns = [];

export function register(on) {
  on("classic.SessionStart", async ($, e, next) => {
    const result = await next(e);
    await seed($, e.transcript_path);
    return result;
  });

  on("classic.UserPromptSubmit", async ($, e, next) => {
    const result = await next(e);
    if (turns.length === 0) {
      await seed($, e.transcript_path);
    }
    return result;
  });

  on("session.append", async ($, e, next) => {
    const result = await next(e);
    if (
      e.agentId === undefined &&
      e.door === "prompt" &&
      e.message.type === "user" &&
      e.message.isMeta !== true
    ) {
      const text = textOf(e.message.content);
      if (isQuestionText(text) && !turns.some(turn => turn.id === e.uuid)) {
        turns.push({ id: e.uuid, text, answer: "", at: Date.now() });
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
      if (last && last.answer === "") {
        last.answer = oneLine(e.answer, ANSWER_CAP);
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
              ` ${oneLine(q.text, room)}`,
            ],
          }),
          Text({
            color: "black",
            dimColor: true,
            children: q.answer === "" ? "A: …" : `A: ${oneLine(q.answer, room)}`,
          }),
        ],
      }),
    );

    const strip = Box({
      flexDirection: "row",
      gap: 1,
      paddingX: 1,
      children: [
        Text({ color: "cyan", bold: true, children: `≋  ${turns.length}` }),
        Text({ dimColor: true, children: "tides" }),
        ...fitOnOneLine(turns, e.bodyColumns ?? 80).map(q =>
          Box({
            key: `b:${q.id}`,
            backgroundColor: "cyan",
            hover: { scope: `q:${q.id}` },
            children: [
              Button({
                key: `q:${q.id}`,
                plain: true,
                label: " ".repeat(barWidth(q)),
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
function isQuestionText(text) {
  return (
    text !== "" &&
    !text.startsWith("/") &&
    !text.startsWith("<command-name>") &&
    !text.startsWith("[Request interrupted")
  );
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
async function seed($, transcriptPath) {
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
        found.push({ id: row.uuid, text, answer: "", at: Date.parse(row.timestamp ?? "") || 0 });
        continue;
      }
    }
    if (row.type === "assistant" && row.isSidechain !== true && found.length > 0) {
      const text = oneLine(textOf(row.message?.content), ANSWER_CAP);
      if (text !== "") {
        found[found.length - 1].answer = text;
      }
    }
  }
  turns = found;
  $.ui.invalidate("ui.render");
}

// the whole file is preferred; a transcript past the 4 MiB read cap falls
// back to its last MiB through a host tail
async function readTranscript($, path) {
  const whole = await $.fs.read(path).catch(() => undefined);
  if (whole !== undefined) {
    return whole;
  }
  const tail = await $.process.run(["tail", "-c", "1048576", path]).catch(() => undefined);
  return tail === undefined || tail.exitCode !== 0 ? undefined : tail.stdout;
}

function oneLine(text, room) {
  const flat = text.replace(/\s+/g, " ");
  return flat.length > room ? flat.slice(0, Math.max(1, room - 1)) + "…" : flat;
}

// the strip never wraps: fill one line from the newest turn backwards until
// the width runs out, like token-weather's last-twelve chart — the count in
// the lead still names every turn there was
function fitOnOneLine(list, columns) {
  const budget = Math.max(24, Math.max(8, columns) - 14);
  let used = 0;
  let start = list.length;
  while (start > 0 && used + barWidth(list[start - 1]) + 1 <= budget) {
    start -= 1;
    used += barWidth(list[start]) + 1;
  }
  return list.slice(start);
}

// a turn's bar width, token-weather's history chart turned horizontal: the
// longer the answer, the longer the bar; the running turn sits at a middle
// width until its answer lands
function barWidth(q) {
  const len = q.answer.length;
  if (len === 0) return 3;
  if (len <= 40) return 2;
  if (len <= 120) return 3;
  if (len <= 240) return 4;
  return 5;
}
