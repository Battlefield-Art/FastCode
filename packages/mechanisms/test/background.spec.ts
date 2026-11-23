import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { backgroundCommand, rememberBackground } from '../src/index.ts'

/** Temporary data directories, deleted after each test. */
const made: string[] = []
const tempDir = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), prefix)); made.push(dir); return dir }
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('background commands, remembered until their output is read', () => {
  it('finds a task\'s command under its agent and conversation only, in any data directory', () => {
    const [primary, legacy] = [tempDir('tokenwise-bg-'), tempDir('tokenwise-bg-')]
    rememberBackground(legacy, 'claude', 's1', 'b0abc1234', { command: 'pytest -v', cwd: '/w' })
    expect(backgroundCommand([primary, legacy], 'claude', 's1', 'b0abc1234')).toEqual({ command: 'pytest -v', cwd: '/w' })
    expect(backgroundCommand([primary, legacy], 'claude', 's2', 'b0abc1234')).toBeUndefined()
    expect(backgroundCommand([primary, legacy], 'codebuddy', 's1', 'b0abc1234')).toBeUndefined()
    expect(backgroundCommand([primary, legacy], 'claude', 's1', 'other')).toBeUndefined()
    // A task ID cannot reach outside its folder.
    rememberBackground(primary, 'claude', 's1', '../../x', { command: 'ls' })
    expect(backgroundCommand([primary], 'claude', 's1', '../../x')).toEqual({ command: 'ls' })
    expect(existsSync(join(primary, 'background', 'x.json'))).toBe(false)
  })

  it('forgets conversations untouched for three days', () => {
    const dir = tempDir('tokenwise-bg-')
    rememberBackground(dir, 'claude', 'old', 't1', { command: 'make' })
    const old = new Date(Date.now() - 4 * 86_400_000)
    utimesSync(join(dir, 'background', 'claude', 'old'), old, old)
    rememberBackground(dir, 'claude', 'new', 't2', { command: 'make test' })
    expect(backgroundCommand([dir], 'claude', 'old', 't1')).toBeUndefined()
    expect(backgroundCommand([dir], 'claude', 'new', 't2')).toEqual({ command: 'make test' })
  })
})
