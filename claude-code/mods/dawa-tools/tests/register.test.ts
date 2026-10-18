// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__dawa-tools__harness_model'

test('harness_model refuses a harness that is not configured', async $ => {
  const { result } = await $.tool.call({
    tool: TOOL,
    action: 'set',
    harness: 'nope',
    model: 'x',
  })

  expect(String(result)).toContain('Unknown harness')
})

test('turn.step sends the picked effort and leaves the model to /model', async ($, on) => {
  mock.store(on, {
    selection: { model: 'claude-opus-5-5', effort: 'max' },
  })

  let sent: { model: string; effort?: unknown } | undefined
  on('turn.step', async function* (_$, e) {
    sent = e

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })

  for await (const _ of $.turn.step({
    turnId: 't1',
    index: 0,
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    messageCount: 1,
  })) {
    void _
  }

  expect(sent?.model).toBe('claude-sonnet-5-5')
  expect(sent?.effort).toBe('max')
})
