// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** The model and effort the person picked; null leaves the session's own. */
export type Selection = { model: string | null; effort: string | null }

/** What the last request of the main loop actually used. */
export type Seen = { model: string; effort: string }

export type ModRow = { id: string; name: string; isEnabled: boolean }

export type HarnessRow = {
  id: string
  name: string
  models: string[]
  current: string | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'dawa-tools': {
      selection: Selection
      seen: Seen
      mods: ModRow[]
      harnesses: HarnessRow[]
      notice: string
    }
  }
}
