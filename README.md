# claude-code-playground

A playground of Claude Code setups, skills and demos from Anthropic DevRel. Maintained by the Anthropic DevRel team; not accepting external contributions.

> **Please read before using anything here**
>
> - This is not an official Anthropic product. It is a playground: things the Anthropic DevRel team found useful or fun and wanted to share.
> - Entries are provided as-is, with no support and no guarantee they still work. The DevRel team maintains the repository, but examples may break as Claude Code, the Claude API and the models change.
> - We're not accepting outside contributions yet. Issues and pull requests from outside Anthropic may be closed without review. See [CONTRIBUTING.md](CONTRIBUTING.md).
> - Nothing here is best-practice canon. Treat it as "here is what we did", not "here is what you should do".

## What this is

A collection of things the DevRel team is excited to share:

- **How we actually set up Claude Code** — real hooks, `CLAUDE.md` files, `settings.json` examples and end-to-end personal workflows, with commentary on why.
- **Demos of what is possible** — the result plus the story of how it was made, rather than a template to fork.
- **Reusable skills** we use ourselves that are not part of the official plugin marketplace.
- **Launch demos** — demos shown at model launches, with the exact prompt and setup so you can try them yourself.

## Directory map

| Directory | What lives there |
| --- | --- |
| [`claude-code/hooks/`](claude-code/hooks/) | Hook examples, one folder per hook |
| [`claude-code/claude-md/`](claude-code/claude-md/) | Real `CLAUDE.md` files with commentary |
| [`claude-code/settings/`](claude-code/settings/) | `settings.json` examples |
| [`claude-code/workflows/`](claude-code/workflows/) | End-to-end personal setups, one folder per person or workflow |
| [`claude-code/mods/`](claude-code/mods/) | Mods: plugins that change what Claude Code does or draw their own UI, one folder per mod |
| [`skills/`](skills/) | Reusable skills that are not in the official marketplace |
| [`demos/`](demos/) | Art-of-the-possible demos, each with how it was built |
| [`launch-demos/`](launch-demos/) | Demos shown at model launches, with the exact prompt and setup |
| [`_template/`](_template/) | The entry template and pre-flight checklist every entry follows |

## How to use

Each entry is self-contained: open its folder and follow the "Run it" section of its README. Nothing is installed or configured at the repository root.

## Every entry explains how it was built

Each entry has its own `README.md` based on [`_template/README.md`](_template/README.md): what it shows, a demo, how it was built (which publicly available model, the prompts, what did not work), how to run it, and its limitations. Before an entry is added it goes through the [pre-flight checklist](_template/PREFLIGHT.md).

## Looking for something else?

| If you want | Go to |
| --- | --- |
| Agent Skills examples and the skills spec | [anthropics/skills](https://github.com/anthropics/skills) |
| Deployable starter apps to clone | [anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts) |
| Claude Agent SDK demo apps | [anthropics/claude-agent-sdk-demos](https://github.com/anthropics/claude-agent-sdk-demos) |
| API notebooks and tutorials | [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) |
| Installable Claude Code plugins | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) |
| Documentation | [docs.claude.com](https://docs.claude.com) and the [Claude Code docs](https://docs.claude.com/en/docs/claude-code) |

## How this repo is published

Entries are staged in a private source repository, which is the source of truth, and exported to the public repository by hand. For each export a maintainer starts from a clean, up-to-date checkout of the private `main`, reviews the full diff of the export against a checkout of the public repository, and commits and pushes the result themselves. No CI job, bot, webhook or scheduled task ever publishes entries to the public repository; the only automation there is Dependabot, which keeps the pinned GitHub Actions current, and the CLA check. CI only checks; it never publishes.

## Security

See [SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE). Individual entries may include third-party components under their own licenses; those are noted in the entry.

Claude and Anthropic are trademarks of Anthropic, PBC. Third-party names belong to their owners.
