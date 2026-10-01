# Mods

Claude Code mods: plugins with a hooks module that can change what Claude Code does and draw their own UI, such as a pane with buttons or a line above the prompt. One folder per mod. Each folder is a complete plugin, with a README based on [`_template/README.md`](../../_template/README.md) that explains how it was built.

| Mod | What it does |
| --- | --- |
| [`blast-radius/`](blast-radius/) | Holds a risky shell command (`rm -rf`, `git reset --hard`, a force push, a migration) and shows what it would change, with Proceed and Cancel buttons. |
| [`replay-theater/`](replay-theater/) | Lets you step through the file edits Claude made in the last turn, one diff at a time. |
| [`token-weather/`](token-weather/) | Draws a live forecast of the context window above the prompt. |

The mods need Claude Code 2.1.287 or later, where mods load by default.

## Install

Try one mod for a single session:

```bash
git clone https://github.com/anthropics/claude-code-playground.git
cd claude-code-playground/claude-code/mods
claude --plugin-dir ./token-weather
```

Or add this folder as a local marketplace, then install the ones you want:

```bash
claude plugin marketplace add ./
claude plugin install token-weather@claude-code-playground-mods --scope user
```

See the [Claude Code plugins documentation](https://code.claude.com/docs/en/plugins) for how plugins and marketplaces work, and for how to review a plugin before you install it.
