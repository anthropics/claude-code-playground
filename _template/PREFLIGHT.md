# Pre-flight checklist

Work through this for every entry before opening a pull request. The pull request template carries a short version; this is the full list. If any item is not a clear yes, stop and ask.

- [ ] Built on, or re-run on, publicly available models only. No unreleased models or features are used or mentioned.
- [ ] No internal codenames, go-links, internal hostnames or URLs, Slack links, or links to employee-only documents anywhere in the entry (code, comments, prompts, screenshots, transcripts).
- [ ] No customer data, internal metrics, internal benchmarks or evaluation results.
- [ ] No secrets, tokens, API keys, credentials or internal email addresses. CI runs a secret scan, but check anyway, including screenshots and transcripts.
- [ ] The entry's own name and folder name contain no Anthropic trademark (such as "Claude") and no third-party trademark or product name. The fixed parent directories, such as `claude-code/` or the model folder under `launch-demos/`, do not count.
- [ ] The Dependencies table in the entry README (see `_template/README.md`) is filled in for every runtime and build dependency, or says "None", and every license in it is permissive (MIT, Apache-2.0, BSD, ISC or similar). Anything else (GPL, AGPL, non-commercial, custom terms, unclear) is flagged in the pull request for review.
- [ ] Third-party names, logos, assets, datasets and trademarks are used only with permission or in a clearly nominative way, and every third-party product named in the entry has its line in the README's Third-party notices section (see `_template/README.md`). Assets are ours or openly licensed, with attribution where required.
- [ ] Every code file in the entry carries a `Copyright <year> Anthropic PBC` line and an `SPDX-License-Identifier: Apache-2.0` line at the top (after any shebang line), in that file type's comment syntax. Formats with no comment syntax, such as JSON, are exempt.
- [ ] The entry runs from a clean checkout by following its README with placeholder configuration only; required environment variables are documented in a `.env.example`, never a real `.env`.
- [ ] If a transcript is published, it has been read end to end and checked for all of the above.
- [ ] The entry's README follows `_template/README.md`, names the public model used and explains how it was built.
- [ ] The private repository's pre-flight scan passes locally.
