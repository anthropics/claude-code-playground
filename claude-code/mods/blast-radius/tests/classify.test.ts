// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'claude-code/testing'

import {
  classify,
  classifyPowerShell,
  joinDir,
  matchesPsFlag,
  tokenize,
  tokenizePowerShell,
} from '../hooks/blast-radius.mjs'

// ---- Bash: rm ---------------------------------------------------------------

test('rm needs -r or -f to be risky, and bare rm is not', async () => {
  expect(classify('rm notes.txt')).toBeNull()
  expect(classify('rm -r build')?.kind).toBe('rm')
  expect(classify('rm -f build')?.kind).toBe('rm')
  expect(classify('rm -rf build')?.kind).toBe('rm')
  expect(classify('rm --recursive build')?.kind).toBe('rm')
  expect(classify('rm --force build')?.kind).toBe('rm')
})

test('rm is still caught through a path or an escaped alias', async () => {
  expect(classify('/usr/bin/rm -rf build')?.kind).toBe('rm')
  expect(classify('\\rm -rf build')?.kind).toBe('rm')
})

test('rm targets are the non-flag args', async () => {
  const risk = classify('rm -rf build dist')
  expect(risk?.targets).toEqual(['build', 'dist'])
})

// ---- Bash: cd / pushd / popd / subshell scoping -----------------------------

test('cd, pushd and popd move the folder a later risk is measured in', async () => {
  expect(classify('cd build && rm -rf .')?.dir).toBe('build')
  expect(classify('pushd build && rm -rf .')?.dir).toBe('build')
  expect(classify('cd a && cd b && rm -rf .')?.dir).toBe('a/b')
})

test('a cd inside parentheses does not outlive them', async () => {
  const risk = classify('(cd build) && rm -rf .')
  expect(risk?.dir).toBeNull()
})

// ---- Bash: git ---------------------------------------------------------------

test('git reset --hard is risky, a soft reset is not', async () => {
  expect(classify('git reset --hard')?.kind).toBe('git-reset')
  expect(classify('git reset --soft HEAD~1')).toBeNull()
})

test('git clean is risky and keeps its flags for the dry run', async () => {
  const risk = classify('git clean -fdx -e dist')
  expect(risk?.kind).toBe('git-clean')
})

test('git push --force variants are risky, a plain push is not', async () => {
  expect(classify('git push --force origin main')?.kind).toBe('git-push-force')
  expect(classify('git push -f origin main')?.kind).toBe('git-push-force')
  expect(classify('git push --force-with-lease origin main')?.kind).toBe('git-push-force')
  expect(classify('git push origin +main')?.kind).toBe('git-push-force')
  expect(classify('git push origin main')).toBeNull()
})

test('git checkout -- . and git restore . are risky, a staged-only restore is not', async () => {
  expect(classify('git checkout -- .')?.kind).toBe('git-checkout')
  expect(classify('git restore .')?.kind).toBe('git-checkout')
  expect(classify('git restore --staged .')).toBeNull()
})

test('git -C moves where a later risk is measured', async () => {
  expect(classify('git -C sub reset --hard')?.dir).toBe('sub')
})

// ---- Bash: migrations ---------------------------------------------------------

test('known migration tools are recognised by their own command', async () => {
  expect(classify('alembic upgrade head')?.tool).toBe('alembic')
  expect(classify('bin/rails db:migrate')?.tool).toBe('rails')
  expect(classify('db:migrate:status')).toBeNull()
  expect(classify('npx prisma migrate deploy')?.tool).toBe('prisma')
  expect(classify('python3 manage.py migrate')?.tool).toBe('django')
})

test('a bare migrate argument is caught for unknown tools, but not for read-only ones', async () => {
  expect(classify('./my-tool migrate')?.tool).toBe('unknown')
  expect(classify('echo migrate')).toBeNull()
  expect(classify('grep migrate schema.rb')).toBeNull()
})

// ---- Bash: sudo / prefixes / nice -------------------------------------------

test('sudo, env prefixes and nice are stripped before classifying', async () => {
  expect(classify('sudo rm -rf build')?.kind).toBe('rm')
  expect(classify('sudo -u root rm -rf build')?.kind).toBe('rm')
  expect(classify('env FOO=1 rm -rf build')?.kind).toBe('rm')
  expect(classify('nice -n 10 rm -rf build')?.kind).toBe('rm')
  expect(classify('VAR=1 rm -rf build')?.kind).toBe('rm')
})

test('tokenize honours single and double quotes', async () => {
  expect(tokenize('rm -rf "my build"')).toEqual(['rm', '-rf', 'my build'])
  expect(tokenize("rm -rf 'my build'")).toEqual(['rm', '-rf', 'my build'])
})

// ---- PowerShell: Remove-Item --------------------------------------------------

test('Remove-Item needs -Recurse or -Force to be risky, and bare Remove-Item is not', async () => {
  expect(classifyPowerShell('Remove-Item notes.txt')).toBeNull()
  expect(classifyPowerShell('Remove-Item -Recurse build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -Force build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -Recurse -Force build')?.kind).toBe('rm')
})

test('Remove-Item is case-insensitive and recognises its default aliases', async () => {
  expect(classifyPowerShell('REMOVE-ITEM -Recurse build')?.kind).toBe('rm')
  expect(classifyPowerShell('ri -Recurse build')?.kind).toBe('rm')
  expect(classifyPowerShell('rd -Recurse build')?.kind).toBe('rm')
  expect(classifyPowerShell('erase -Force build')?.kind).toBe('rm')
  expect(classifyPowerShell('del -Force build')?.kind).toBe('rm')
  expect(classifyPowerShell('rmdir -Recurse build')?.kind).toBe('rm')
})

test('an unambiguous flag prefix still matches, but an unrelated flag does not', async () => {
  expect(classifyPowerShell('Remove-Item -r build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -rec build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -f build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -for build')?.kind).toBe('rm')
  expect(classifyPowerShell('Remove-Item -Confirm build')).toBeNull()
})

test('Remove-Item targets are the non-flag args', async () => {
  const risk = classifyPowerShell('Remove-Item -Recurse -Force build dist')
  expect(risk?.targets).toEqual(['build', 'dist'])
})

test('a pipeline stage after Remove-Item is not matched: it is a documented v1 gap', async () => {
  expect(classifyPowerShell('Get-ChildItem build | Remove-Item -Force')).toBeNull()
})

// ---- PowerShell: Set-Location / Push-Location / Pop-Location ------------------

test('Set-Location, Push-Location and Pop-Location move the folder a later risk is measured in', async () => {
  expect(classifyPowerShell('Set-Location build; Remove-Item -Recurse .')?.dir).toBe('build')
  expect(classifyPowerShell('cd build; Remove-Item -Recurse .')?.dir).toBe('build')
  expect(classifyPowerShell('Push-Location build; Remove-Item -Recurse .')?.dir).toBe('build')
  expect(classifyPowerShell('pushd a; pushd b; Remove-Item -Recurse .')?.dir).toBe('a/b')
})

// ---- PowerShell: git and migrations, shared with Bash -------------------------

test('git detection behaves the same from PowerShell as from Bash', async () => {
  expect(classifyPowerShell('git reset --hard')?.kind).toBe('git-reset')
  expect(classifyPowerShell('git push --force origin main')?.kind).toBe('git-push-force')
  expect(classifyPowerShell('git push origin main')).toBeNull()
})

test('migration detection behaves the same from PowerShell as from Bash', async () => {
  expect(classifyPowerShell('alembic upgrade head')?.tool).toBe('alembic')
  expect(classifyPowerShell('echo migrate')).toBeNull()
})

// ---- PowerShell: quoting ------------------------------------------------------

test('tokenizePowerShell honours single quotes (literal) and double quotes (backtick escape)', async () => {
  expect(tokenizePowerShell("Remove-Item 'my build'")).toEqual(['Remove-Item', 'my build'])
  expect(tokenizePowerShell('Remove-Item "a `"quoted`" word"')).toEqual(['Remove-Item', 'a "quoted" word'])
})

// ---- Shared helpers ------------------------------------------------------------

test('matchesPsFlag matches any unambiguous prefix of the full name', async () => {
  expect(matchesPsFlag('-r', 'Recurse')).toBe(true)
  expect(matchesPsFlag('-recurse', 'Recurse')).toBe(true)
  expect(matchesPsFlag('-x', 'Recurse')).toBe(false)
  expect(matchesPsFlag('recurse', 'Recurse')).toBe(false)
})

test('joinDir resolves ~, absolute and relative targets the same for both shells', async () => {
  expect(joinDir(null, 'sub')).toBe('sub')
  expect(joinDir('a', 'b')).toBe('a/b')
  expect(joinDir('a', '/root')).toBe('/root')
  expect(joinDir('a', '~')).toBe('~')
  expect(joinDir('a', undefined)).toBe('~')
})
