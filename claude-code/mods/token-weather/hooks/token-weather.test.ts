// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { expect, mock, test } from "claude-code/testing";

const BAND = { plugin: "token-weather", surface: "terminal", component: "AbovePrompt", props: {} } as const;

test("after /clear the band reads the new window, not the old conversation", async ($, on) => {
  const clock = mock.clock(on);
  // The engine beneath: 600k of 1M answered over, then a cleared window that
  // no response has reported yet, estimated at 31.2k.
  let context: Record<string, unknown> = { window: 1_000_000, tokens: 600_000, percent: 60 };
  on("session.usage", (_$, e) => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: e?.breakdown ? { ...context, breakdown: { totalTokens: 31_200 } } : context,
    },
  }));
  on("ui.render", () => null);
  on("turn.complete", () => ({ text: "" }));
  on("session.end", (_$, e) => ({ sessionId: e.sessionId }));

  await $.turn.complete({ turnId: "t1", answer: "" } as never);
  let ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: /60% of context/ })).toBeDefined();
  await ui.unmount();

  context = { window: 1_000_000 };
  await $.session.end({ reason: "clear", sessionId: "s1", resume: { id: "s1" } } as never);
  await clock.advance(500);

  ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: /~3% of context/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /~31\.2k \/ 1M/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /60%/ })).toBeUndefined();
  await ui.unmount();
});
