# Working in claude-code-playground

This repository is destined to be public. Treat every file as if it were already published.

- New entries start from `_template/README.md` and must satisfy every item in `_template/PREFLIGHT.md`. Put each entry in its own folder under the matching directory (see the directory map in `README.md`).
- Run the private repository's pre-flight scan before committing and fix anything it reports.
- Reference publicly available models only, by their public names. Never add internal codenames, go-links, internal hostnames, Slack links, internal document links, customer data or internal metrics.
- Keep entries self-contained: dependencies, lockfiles, scripts and instructions live inside the entry's folder. Do not add dependencies, package manifests or tooling at the repository root.
- Keep prose plain and concise. Entries are shared as-is; do not promise support or maintenance.
- Do not add attribution trailers or model identifiers to commit messages.
- To add an entry, open a pull request. A maintainer reviews it before it merges. Never add a workflow, hook, script or scheduled task that publishes entries automatically.
