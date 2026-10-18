# Dawa Tools

A Claude Code mod that puts a small control panel one click away from the prompt. You pick the model and effort with the mouse, switch other mods on and off, and see which model each external coding harness is using. We're sharing it as an example of a mod that combines a band, a pane, a per-request rewrite and a tool the model calls.

## What this shows

A row above the prompt shows the model and effort in use, with a **◆ Dawa Tools** button on the right:

```text
 Sonnet 5.5 · effort medium                                     ◆ Dawa Tools
```

Pressing the button, or running `/dawa-tools`, opens a pane:

```text
 MODEL   Haiku 5.5  Sonnet 5.5  Opus 5.5  Fable 5.1
 EFFORT  low  medium  high  xhigh  max
 use session default

 MODS
 ● blast-radius   On
 ○ token-weather  Off

 HARNESSES  refresh
 opencode  using  deepseek/deepseek-v4-pro
 deepseek/deepseek-flash  deepseek/deepseek-v4-pro  opencode/big-pickle ...
 reasonix  using  not set
 deepseek-flash  deepseek-v4-pro
```

- **Model and effort.** Click a model or an effort level. The choice is saved across sessions and applied to every request of the main conversation from the next one on. Subagents keep their own settings. "use session default" clears it.
- **Mods.** Lists the installed plugins with their state. Click On or Off to run `claude plugin enable` or `claude plugin disable`, then `/reload-plugins`.
- **Harnesses.** Lists the harnesses named in `harnesses.json`, the models each one offers (read from the harness itself, not typed in) and the model recorded as in use. The panel only shows that record. Claude owns it: the mod registers a tool, `harness_model`, and Claude calls it to list a harness's models and to record the one it chose for the session and task at hand. The tool refuses a model the harness does not list.

| Hook | What it does |
|------|--------------|
| `session.start` | Restores the saved choice, runs `/model` with the saved model, registers `/dawa-tools` and the `harness_model` tool, and loads mods and harnesses. |
| `turn.step` | Rewrites `effort` on main-loop requests when a choice is saved. |
| `tool.call` for `harness_model` | Serves the tool: `list` and `set`. |
| `command.run` for `dawa-tools` | Opens the pane. |
| `ui.render` with `{component: "AbovePrompt"}` | Draws the row above the prompt. |
| `ui.render` with `{component: "Pane"}` | Draws the panel. |

### Adding a harness

Add an entry to `harnesses.json` (or ask Claude to). Each entry says how to list the harness's models:

```json
{
  "id": "opencode",
  "name": "opencode",
  "models": { "command": ["opencode", "models"], "format": "lines" }
}
```

`format` is `lines` (one model per line of output) or `json`, where `path` walks the parsed output, with `name[]` fanning out over an array, for example `providers[].models`. `include` is optional: only models whose name contains that text (ignoring case) are listed and accepted. The opencode entry uses `"include": "deepseek"`. Press **refresh** in the pane after editing.

## Demo

No screenshots yet. The text above shows the layout.

## How it was built

- **Model:** built with Claude Sonnet 5.5 in Claude Code. The mod itself calls no model.
- **Prompt(s):** the request, in Italian, as given:

  > vorrei una mod che chiamiamo dawa tools, che è fatta come quella dell'immagine. quindi va in basso a destra e permette di selezionare con il mouse modello e effort, ha la lista delle mod e mi dice se sono attive o no permettendomi di attivarle e spegnerle. inoltre mi indica gli harness su cui claude ha il controllo e il modello che stanno usando

  Follow-up decisions: harnesses live in a configuration file; Claude, not the panel, chooses and records the harness model; the panel lists every model the harness offers by reading it from the harness.
- **Transcript:** not shared.
- **Iterations:**
  - The reference showed a panel at the bottom right. Panes can only dock beside the transcript or sit above the prompt, so the mod draws a row above the prompt with the button on the right and opens the panel from it.
  - Model and effort are applied by rewriting `turn.step`, because the mod can't change the session's setting directly.
  - `opencode` and `reasonix` are `.cmd` shims on Windows and the host runs commands without a shell, so commands go through `cmd /c` there.
  - Validated with `claude plugin validate`, type-checked with `tsc`, and the tests pass under `claude plugin test`. The panel was not exercised by hand in a live session before this was written.

## Run it

**Requirements:**

- Claude Code 2.1.302 or later (the version the mod was written against).
- A terminal. `AbovePrompt` and panes are drawn on the terminal surface.
- For the harness section: the harnesses named in `harnesses.json` installed and on your `PATH`. A harness that is missing shows its error in the pane; the rest still works.

No environment variables.

**Steps:**

1. Clone this repository and go to this folder's parent:

   ```bash
   git clone https://github.com/anthropics/claude-code-playground.git
   cd claude-code-playground/claude-code/mods
   ```

2. Check the plugin and run its tests:

   ```bash
   claude plugin validate ./dawa-tools
   claude plugin test ./dawa-tools
   ```

3. Try it for one session:

   ```bash
   claude --plugin-dir ./dawa-tools
   ```

   Or install it from the local marketplace in this folder (see the [mods README](../README.md)):

   ```bash
   claude plugin marketplace add ./
   claude plugin install dawa-tools@claude-code-playground-mods --scope user
   ```

4. Click **◆ Dawa Tools** above the prompt, or run `/dawa-tools`.

## Notes / limitations

- **The panel is a pane, not a floating box.** It docks beside the transcript in the fullscreen terminal from 110 columns, and opens above the prompt otherwise.
- **The model is set with `/model`.** Picking a model in the panel runs the built-in `/model <id>` as if you typed it, so the session's model and what `/model` shows both change. The choice is saved and re-applied at the next session start. "use session default" runs `/model default`; this assumes `default` is accepted there. Effort is still an override on each request, and a model that takes no effort setting is sent none.
- **Model names are hard-coded** in `hooks/register.tsx` (`MODELS`, `EFFORTS`). Edit them when new models ship.
- **Mod toggles need a reload.** `claude plugin enable` and `disable` write settings; the mod then queues `/reload-plugins`. It lists plugins that `claude plugin list` reports, so a mod loaded only with `--plugin-dir` is not listed.
- **Harness models are read when you open the panel**, press refresh, or when Claude calls the tool. Listing runs the harness's own command, so it can take a few seconds.
- **The harness record is a note, not a switch.** Recording a model does not reconfigure the harness; Claude passes the model when it runs the harness.

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

The harness section calls `opencode` and `reasonix` if you have them installed. They are not bundled.

## Third-party notices

opencode is a trademark of its owner; use here is descriptive and implies no endorsement.

Reasonix is a trademark of its owner; use here is descriptive and implies no endorsement.

---

Shared as-is as part of claude-code-playground. Not an official Anthropic product; no support or maintenance is implied. See the root README and LICENSE.
