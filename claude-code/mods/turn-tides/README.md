# Turn Tides

The tides of a session's turns, drawn above the prompt: one bar per turn, its width reading the length of the answer. Hover a bar for the turn's question and an answer summary; click it to scroll the transcript back to that turn. A companion to `token-weather`, which charts the context window — this one charts the conversation.

## What this shows

- **Composing band mods.** A `ui.render (AbovePrompt)` hook that wraps whatever the chain beneath it draws (`await next(e)`) instead of returning its own tree alone, so `token-weather`'s forecast and this strip share the band. Band mods that answer alone crowd every other band mod out; composing is the fix.
- **Hover as a pure styling channel.** No hook runs on hover. Each bar joins a hover group (`hover: { scope }`), and its summary is pre-drawn with `display: "none"` plus `hover: { display: "flex", scope }`, unfolding above the strip when the group lights.
- **Click-to-navigate with `$.ui.scroll`.** A transcript row scrolls into view by `requestId` — the same uuid `session.append` hands over, which is the join between live appends and transcript rows.
- **Transcript seeding.** The session's own `.jsonl` is read on `classic.SessionStart`, with a `$.process.run` tail fallback for transcripts past the 4 MiB `$.fs.read` cap, and a lazy re-seed on the first `classic.UserPromptSubmit` after a mid-session load.

## Demo

![A hover unfolding one turn's summary above the strip of turn bars](screenshots/demo.png)

The strip is one line above the prompt, always on; hovering a bar unfolds that turn's summary above it.

## How it was built

- **Model:** developed and iterated inside Claude Code 2.1.292 with GLM-5.3 (public) as the session model. The mod uses only the engine's plugin API.
- **Prompt(s):** no fixed prompt — it was built by iterating against live feedback in one working session ("the bars are too small", "hover doesn't show", "the colors are too loud"), which shaped both the UI and the engine findings below.
- **Transcript:** not shareable; it is a working session on the author's machine.
- **Iterations:** the UI went through list-in-pane → square glyphs → full-width rows → horizontal bars, each round against user feedback. Two engine findings forced the final shape: absolutely positioned boxes are clipped to their site's region (so a slim pane cannot host a wide hover card, and a band card cannot float above the band — the summary unfolds in flow instead), and only one plugin's tree draws a site (fixed by composing). A third finding: `$.fs.read` caps at 4 MiB, which a long session's transcript exceeds, hence the tail fallback.

## Run it

**Requirements:** Claude Code 2.1.287 or later. Hover needs a terminal that reports mouse movement (Ghostty, iTerm2, kitty, WezTerm do); clicking and the summary colors work everywhere.

**Steps:**

```bash
git clone https://github.com/anthropics/claude-code-playground.git
cd claude-code-playground/claude-code/mods
claude --plugin-dir ./turn-tides
```

Or add the folder as a local marketplace, then install:

```bash
claude plugin marketplace add ./
claude plugin install turn-tides@claude-code-playground-mods --scope user
```

## Notes / limitations

- Turn bars carry no running/answered color distinction by design (one calm cyan); the running turn is the last one.
- Turns older than the tail window (the last MiB of the transcript) do not come back after a reload on a very long session.
- The summary card palette is hard-coded (`#d0f0f4` on black text), chosen to read on both light and dark themes.
- `☰`-style weather icons are avoided; `≋` is a single-width character, like token-weather's `▁▂▃▄▅▆▇█`.

## Dependencies

None. The mod uses only the Claude Code plugin API.

## Third-party notices

None.

---

Shared as-is as part of claude-code-playground. Not an official Anthropic product; no support or maintenance is implied. See the root README and LICENSE.
