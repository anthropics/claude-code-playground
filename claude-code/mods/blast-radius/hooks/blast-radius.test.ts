import { expect, test } from 'claude-code/testing'

import { follow } from './blast-radius.mjs'

type Pane = { isPlaced: boolean; isShown: boolean }

/** A `$` with just what `follow` calls: the open panes, and invalidate, counted. */
function fake(pane: Pane | undefined) {
  const calls = { invalidates: 0 }
  const $ = {
    ui: {
      panes: async () => (pane ? [{ id: 'blast-radius', title: 'Blast Radius', isFocused: false, ...pane }] : []),
      invalidate: () => {
        calls.invalidates += 1
      },
    },
  }
  return { $, calls }
}

const held = () => ({ where: 'pane' })

test('a pane opened as a tab behind another pane falls back to the band', async () => {
  const { $, calls } = fake({ isPlaced: true, isShown: false })
  const mine = held()
  await follow($, mine)
  expect(mine.where).toBe('band')
  expect(calls.invalidates).toBe(1)
})

test('a pane waiting for a wider terminal falls back to the band', async () => {
  const mine = held()
  await follow(fake({ isPlaced: false, isShown: false }).$, mine)
  expect(mine.where).toBe('band')
  const gone = held()
  await follow(fake(undefined).$, gone)
  expect(gone.where).toBe('band')
})

test('a pane that is shown keeps the report in the pane', async () => {
  const { $, calls } = fake({ isPlaced: true, isShown: true })
  const mine = held()
  await follow($, mine)
  expect(mine.where).toBe('pane')
  expect(calls.invalidates).toBe(0)
})

test('the report follows the pane into view and out of it', async () => {
  const pane = { isPlaced: true, isShown: false }
  const { $, calls } = fake(pane)
  const mine = held()
  await follow($, mine)
  expect(mine.where).toBe('band')
  pane.isShown = true
  await follow($, mine)
  expect(mine.where).toBe('pane')
  pane.isShown = false
  await follow($, mine)
  expect(mine.where).toBe('band')
  expect(calls.invalidates).toBe(3)
})
