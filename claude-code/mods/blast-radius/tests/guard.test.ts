import { expect, mock, test } from 'claude-code/testing'

const PANE_PROPS = {
  plugin: 'blast-radius',
  component: 'Pane',
  requestId: 'blast-radius',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'Blast Radius',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type On = (name: string, handler: (...args: any[]) => any) => void

// The hold loop polls with `sleep`. Answering it instantly makes the loop spin, and the
// kit's find() and press() wait for the mod to go idle, which a spinning loop never does.
// clock.sleep makes each poll wait on the mock clock instead, so the mod is idle between
// polls and the test moves time on by hand.
function stubEngine(on: On, rmStdout: string) {
  const clock = mock.clock(on)
  on('process.run', async ($: unknown, e: { argv: string[] }) => {
    if (e.argv[0] === 'sleep') {
      await clock.sleep(250)
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    }
    return { value: { exitCode: 0, stdout: rmStdout, stderr: '' } }
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // What Claude Code draws when the mod passes the site on: before a hold, or after one ends.
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return clock
}

test('a non-risky Bash command runs normally', async ($, on) => {
  on('tool.call', () => ({ result: 'ran it' }))

  const out = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(out).toEqual({ result: 'ran it' })
})

test('a non-risky PowerShell command runs normally', async ($, on) => {
  on('tool.call', () => ({ result: 'ran it' }))

  const out = await $.tool.call({ tool: 'PowerShell', command: 'Get-ChildItem' })
  expect(out).toEqual({ result: 'ran it' })
})

test('a risky Bash command opens a pane, and Cancel refuses it', { timeoutMs: 3000 }, async ($, on) => {
  const clock = stubEngine(on, '2 2048 1\nbuild/a.txt\nbuild/b.txt\n')

  const call = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  await clock.settle()

  const pane = await $.ui.mount(PANE_PROPS)
  expect(await pane.find({ type: 'Text', text: /rm -rf build/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /delete 2 files/ })).toBeDefined()
  await pane.press({ key: 'cancel' })
  await clock.advance(250)

  const result = (await call) as { deny?: string }
  expect(result.deny).toContain('the user pressed Cancel')
})

test('a risky PowerShell command opens a pane, and Proceed runs it', { timeoutMs: 3000 }, async ($, on) => {
  const clock = stubEngine(on, '1 512 1\nC:\\work\\build\\a.txt\n')
  on('tool.call', () => ({ result: 'ran it' }))

  const call = $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse -Force build' })
  await clock.settle()

  const pane = await $.ui.mount(PANE_PROPS)
  expect(await pane.find({ type: 'Text', text: /Remove-Item -Recurse -Force build/ })).toBeDefined()
  await pane.press({ key: 'proceed' })
  await clock.advance(250)

  expect(await call).toEqual({ result: 'ran it' })
})

test('a second risky call waits until the first is answered', { timeoutMs: 3000 }, async ($, on) => {
  const clock = stubEngine(on, '0 0 0\n')

  const first = $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  const second = $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse build2' })
  await clock.settle()

  const firstPane = await $.ui.mount(PANE_PROPS)
  // While the first call is held, the pane shows the first command, not the second.
  expect(await firstPane.find({ type: 'Text', text: /rm -rf build/ })).toBeDefined()
  await firstPane.press({ key: 'cancel' })
  await clock.advance(250)
  await first
  await firstPane.unmount()

  // The second call was waiting on the same slot; it takes the hold on its next poll.
  await clock.advance(250)
  const secondPane = await $.ui.mount(PANE_PROPS)
  expect(await secondPane.find({ type: 'Text', text: /Remove-Item -Recurse build2/ })).toBeDefined()
  await secondPane.press({ key: 'cancel' })
  await clock.advance(250)

  const result = (await second) as { deny?: string }
  expect(result.deny).toContain('the user pressed Cancel')
})
