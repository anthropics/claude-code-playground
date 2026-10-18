// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Dawa Tools: a control panel for the session.
//
// ui.render (AbovePrompt): one row with the model and effort in use and a
// button on the right that opens the panel.
// ui.render (Pane): clickable model and effort, the installed mods with an
// On/Off switch each, and the external harnesses with the models each one
// offers and the one Claude last chose for it.
// The picked model goes through the built-in /model, so the session itself
// changes model. turn.step applies the picked effort to the main loop's requests.
// tool.call (harness_model): the tool Claude uses to list a harness's models
// and to record which one it chose. The panel only shows that choice.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { HarnessRow, ModRow, Seen, Selection } from '../types'

type Engine = EngineInterface

const PANE = 'dawa-tools'
const TOOL = 'mcp__dawa-tools__harness_model'

const MODELS = [
  { key: 'haiku', label: 'Haiku 5.5', id: 'claude-haiku-5-5' },
  { key: 'sonnet', label: 'Sonnet 5.5', id: 'claude-sonnet-5-5' },
  { key: 'opus', label: 'Opus 5.5', id: 'claude-opus-5-5' },
  { key: 'fable', label: 'Fable 5.1', id: 'claude-fable-5-1' },
]
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const selection = atom(
  { plugin: 'dawa-tools', key: 'selection' } as const,
  { model: null, effort: null } as Selection,
)
const seen = atom(
  { plugin: 'dawa-tools', key: 'seen' } as const,
  { model: '', effort: '' } as Seen,
)
const mods = atom({ plugin: 'dawa-tools', key: 'mods' } as const, [] as ModRow[])
const harnesses = atom(
  { plugin: 'dawa-tools', key: 'harnesses' } as const,
  [] as HarnessRow[],
)
const notice = atom({ plugin: 'dawa-tools', key: 'notice' } as const, '')

type HarnessConfig = {
  id: string
  name: string
  models: {
    command: string[]
    format: 'lines' | 'json'
    path?: string
    include?: string
  }
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const labelOf = (model: string) =>
  MODELS.find(one => model === one.id || model.toLowerCase().includes(one.key))
    ?.label ?? (model === '' ? 'default' : model)

// Host commands run without a shell, so the .cmd shims npm installs on
// Windows (opencode, reasonix, claude) need cmd.exe to be found.
const run = async ($: Engine, argv: readonly string[]) => {
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'

  return $.process.run(isWindows ? ['cmd', '/c', ...argv] : argv, {
    timeoutMs: 60_000,
  })
}

// Follows a dotted path through parsed JSON; `name[]` fans out over an array.
const pick = (value: unknown, path: string): string[] => {
  let level: unknown[] = [value]

  for (const part of path.split('.')) {
    const key = part.replace(/\[\]$/, '')
    level = level
      .map(item => (item as Record<string, unknown> | null)?.[key])
      .flat()
  }

  return level.flat().filter((one): one is string => typeof one === 'string')
}

// `include` keeps only the models whose name contains the text, ignoring case.
const listModels = async ($: Engine, config: HarnessConfig) => {
  const { command, format, path, include } = config.models
  const { exitCode, stdout, stderr } = await run($, command)

  if (exitCode !== 0) {
    throw new Error(stderr.trim().split('\n')[0] || `exit ${exitCode}`)
  }

  const models =
    format === 'json'
      ? pick(JSON.parse(stdout), path ?? '')
      : stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line !== '')
  const wanted = include?.toLowerCase()

  return [...new Set(models)].filter(
    model => wanted === undefined || model.toLowerCase().includes(wanted),
  )
}

const chosenModels = async ($: Engine) =>
  ((await $.store.get('harnessModels')) ?? {}) as Record<string, string>

const loadHarnesses = async ($: Engine) => {
  let configs: HarnessConfig[]

  try {
    const text = await $.fs.read(`${$.plugin.root}/harnesses.json`)
    configs = JSON.parse(text).harnesses
  } catch (error) {
    await update($, notice, () => `harnesses.json: ${messageOf(error)}`)

    return
  }

  const chosen = await chosenModels($)
  const rows = await Promise.all(
    configs.map(async (config): Promise<HarnessRow> => {
      const row = {
        id: config.id,
        name: config.name,
        models: [],
        current: chosen[config.id] ?? null,
        error: null,
      }

      try {
        return { ...row, models: await listModels($, config) }
      } catch (error) {
        return { ...row, error: messageOf(error) }
      }
    }),
  )

  await update($, harnesses, () => rows)
}

const loadMods = async ($: Engine) => {
  try {
    const { exitCode, stdout, stderr } = await run($, [
      'claude',
      'plugin',
      'list',
      '--json',
    ])

    if (exitCode !== 0) {
      throw new Error(stderr.trim().split('\n')[0] || `exit ${exitCode}`)
    }

    const rows: ModRow[] = JSON.parse(stdout).map(
      (item: { id: string; enabled: boolean }) => ({
        id: item.id,
        name: item.id.split('@')[0],
        isEnabled: item.enabled,
      }),
    )

    await update($, mods, () => rows)
  } catch (error) {
    await update($, notice, () => `mods: ${messageOf(error)}`)
  }
}

const toggleMod = async ($: Engine, mod: ModRow) => {
  const verb = mod.isEnabled ? 'disable' : 'enable'
  const { exitCode, stderr } = await run($, ['claude', 'plugin', verb, mod.id])

  if (exitCode !== 0) {
    await update($, notice, () => `${verb} ${mod.name}: ${stderr.trim()}`)

    return
  }

  await loadMods($)
  await update($, notice, () => `${mod.name} ${verb}d. Applied on /reload-plugins.`)
  await $.command.run({ command: 'reload-plugins' }).catch(() => undefined)
}

// Runs the built-in /model as if the person typed it, so the session's model changes.
const applyModel = async ($: Engine, model: string) => {
  await $.command.run({ command: 'model', args: model }).catch(async error => {
    await update($, notice, () => `model: ${messageOf(error)}`)
  })
}

const choose = async ($: Engine, patch: Partial<Selection>) => {
  await update($, selection, current => ({ ...current, ...patch }))
  await $.store.set('selection', {
    ...(((await $.store.get('selection')) ?? {}) as Selection),
    ...patch,
  })

  if ('model' in patch) {
    await applyModel($, patch.model ?? 'default')
  }
}

const openPane = async ($: Engine) => {
  await $.ui.open({
    id: PANE,
    title: 'Dawa Tools',
    focus: true,
    closeOnEscape: true,
  })
  await Promise.all([loadMods($), loadHarnesses($)])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('selection')) as Selection | undefined

    if (saved !== undefined) {
      await update($, selection, () => saved)
    }
    if (saved?.model) {
      await applyModel($, saved.model)
    }

    await $.command.register({
      name: 'dawa-tools',
      description: 'Open the Dawa Tools panel',
    })
    await $.tool.register({
      name: 'harness_model',
      description:
        'External harnesses (opencode, reasonix) that you drive from this session. ' +
        'action "list" returns every harness with the models it offers and the one ' +
        'recorded as in use. action "set" records the model you chose for a harness; ' +
        'call it whenever you pick or change the model for a harness, so the Dawa ' +
        'Tools panel shows it. The model must be one the harness lists.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'set'] },
          harness: { type: 'string', description: 'Harness id, e.g. opencode' },
          model: { type: 'string', description: 'Model name as listed' },
        },
        required: ['action'],
      },
      isDeferred: false,
    })
    void loadMods($)
    void loadHarnesses($)

    return next(e)
  })

  on('command.run', { command: 'dawa-tools' }, async $ => {
    await openPane($)

    return { text: 'Dawa Tools opened.' }
  })
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    const chosen = ((await $.store.get('selection')) ?? {}) as Partial<Selection>
    const effort = chosen.effort ?? e.effort

    await update($, seen, () => ({ model: e.model, effort: String(effort ?? '') }))

    return yield* next({
      ...e,
      effort: effort as typeof e.effort,
    })
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as {
      action: string
      harness?: string
      model?: string
    }
    const rows = await read($, harnesses)

    if (input.action === 'set') {
      const row = rows.find(one => one.id === input.harness)

      if (row === undefined) {
        return { result: `Unknown harness. Known: ${rows.map(one => one.id).join(', ')}` }
      }

      if (input.model === undefined || !row.models.includes(input.model)) {
        return { result: `${row.id} does not list that model. Available: ${row.models.join(', ')}` }
      }

      const chosen = { ...(await chosenModels($)), [row.id]: input.model }
      await $.store.set('harnessModels', chosen)
      await update($, harnesses, list =>
        list.map(one => (one.id === row.id ? { ...one, current: input.model ?? null } : one)),
      )

      return { result: `${row.id} now uses ${input.model}.` }
    }

    await loadHarnesses($)

    return {
      result: (await read($, harnesses))
        .map(
          one =>
            `${one.id}: using ${one.current ?? 'not set'}; models: ${one.models.join(', ') || 'none'}${one.error === null ? '' : ` (error: ${one.error})`}`,
        )
        .join('\n'),
    }
  }).catch(() => ({ deny: 'dawa-tools: harness_model failed.' }))

  // Stacks under the row of any other mod that draws the band (token-weather),
  // so both show whichever is installed first.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const picked = await read($, selection)
    const used = await read($, seen)
    const model = picked.model ?? used.model
    const effort = picked.effort ?? used.effort

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text dimColor>
            {labelOf(model)} · effort {effort === '' ? 'default' : effort}
          </Text>
          <Button
            key="open"
            label="◆ Dawa Tools"
            variant="primary"
            onPress={() => void openPane($)}
          />
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const picked = await read($, selection)
    const used = await read($, seen)
    const modRows = await read($, mods)
    const harnessRows = await read($, harnesses)
    const message = await read($, notice)

    const chip = (key: string, text: string, isOn: boolean, press: () => void) => (
      <Button key={key} plain onPress={press}>
        <Text inverse={isOn} dimColor={!isOn}>
          {` ${text} `}
        </Text>
      </Button>
    )
    const heading = (text: string) => (
      <Text weight="bold">{text.toUpperCase()}</Text>
    )
    const modelNow = picked.model ?? used.model
    const effortNow = picked.effort ?? used.effort

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Box gap={1}>
            <Text dimColor>MODEL </Text>
            {MODELS.map(one =>
              chip(`model:${one.key}`, one.label, labelOf(modelNow) === one.label, () =>
                void choose($, { model: one.id }),
              ),
            )}
          </Box>
          <Box gap={1}>
            <Text dimColor>EFFORT</Text>
            {EFFORTS.map(one =>
              chip(`effort:${one}`, one, effortNow === one, () =>
                void choose($, { effort: one }),
              ),
            )}
          </Box>
          <Box gap={1}>
            {chip('reset', 'use session default', false, () =>
              void choose($, { model: null, effort: null }),
            )}
          </Box>
        </Box>

        <Box flexDirection="column">
          {heading('Mods')}
          {modRows.length === 0 && <Text dimColor>No installed mods found.</Text>}
          {modRows.map(mod => (
            <Box key={`mod:${mod.id}`} gap={1}>
              <Text color={mod.isEnabled ? 'success' : 'inactive'}>
                {mod.isEnabled ? '●' : '○'}
              </Text>
              <Text>{mod.name}</Text>
              {chip(`toggle:${mod.id}`, mod.isEnabled ? 'On' : 'Off', mod.isEnabled, () =>
                void toggleMod($, mod),
              )}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Box gap={1}>
            {heading('Harnesses')}
            {chip('refresh', 'refresh', false, () => void loadHarnesses($))}
          </Box>
          {harnessRows.length === 0 && <Text dimColor>No harnesses configured.</Text>}
          {harnessRows.map(row => (
            <Box key={`harness:${row.id}`} flexDirection="column">
              <Box gap={1}>
                <Text weight="bold">{row.name}</Text>
                <Text dimColor>using</Text>
                <Text color={row.current === null ? 'inactive' : 'success'}>
                  {row.current ?? 'not set'}
                </Text>
              </Box>
              {row.error !== null && <Text color="error">{row.error}</Text>}
              <Box flexWrap="wrap" columnGap={1}>
                {row.models.map(model => (
                  <Text key={`${row.id}:${model}`} inverse={model === row.current} dimColor={model !== row.current}>
                    {model}
                  </Text>
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {message !== '' && <Text dimColor>{message}</Text>}
      </Box>
    )
  })
}
