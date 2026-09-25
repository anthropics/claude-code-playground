# Contributing

Thanks for your interest. We're not accepting outside contributions yet: this is a playground the Anthropic DevRel team shares as-is, and we do not have the capacity to review outside changes. Pull requests from outside Anthropic may be closed without review. If we do accept one, the CLA check asks you to sign first.

If something here inspired you, the best thing to do is build on it in your own repository.

Pull requests, including those from Anthropic staff, are checked by the CLA Assistant workflow, which asks each contributor to sign the [Contributor License Agreement](CLA.md). Everyone taking part in this project is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## For Anthropic staff

New entries are added by Anthropic staff only, in the private source repository:

1. Copy [`_template/README.md`](_template/README.md) into a new folder under the right directory (see the directory map in the root [README](README.md)).
2. Work through every item in [`_template/PREFLIGHT.md`](_template/PREFLIGHT.md). If any item is not a clear yes, stop and ask before opening a pull request.
3. Run the private repository's pre-flight scan locally. CI there runs the same scan plus a secret scan on every pull request.
4. Open a pull request using the pull request template.

Publishing to the public repository is manual: a maintainer exports from a clean checkout of the private `main`, reviews the full diff and commits and pushes by hand, following the internal instructions kept in the private repository. Do not add CI jobs, bots, webhooks, hooks or scheduled tasks that push to, or open pull requests against, the public repository.

Keep entries self-contained: each entry carries its own dependencies, instructions and licensing notes inside its folder, and does not add dependencies, package manifests or tooling at the repository root.
