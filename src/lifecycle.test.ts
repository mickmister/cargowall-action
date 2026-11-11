import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(), getState: vi.fn(), saveState: vi.fn(),
  setOutput: vi.fn(), setFailed: vi.fn(),
}))
vi.mock('./setup', () => ({ setup: vi.fn() }))
vi.mock('./start', () => ({ start: vi.fn() }))

import * as core from '@actions/core'
import { setup } from './setup'
import { start } from './start'
import { run } from './lifecycle'

describe('startup phase lifecycle', () => {
  const state = new Map<string, string>()
  beforeEach(() => {
    vi.resetAllMocks()
    state.clear()
    vi.mocked(core.getState).mockImplementation(key => state.get(key) ?? '')
    vi.mocked(core.saveState).mockImplementation((key, value) => { state.set(key, String(value)) })
    vi.mocked(setup).mockResolvedValue(true)
    vi.mocked(start).mockResolvedValue({ supported: true, pid: 123 })
  })

  it('keeps default startup in main, not pre', async () => {
    vi.mocked(core.getInput).mockReturnValue('')
    await run('pre')
    expect(setup).not.toHaveBeenCalled()
    await run('main')
    expect(setup).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('starts in pre exactly once and restores outputs in main', async () => {
    vi.mocked(core.getInput).mockReturnValue('pre')
    await run('pre')
    await run('main')
    expect(setup).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledWith('supported', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('pid', 123)
  })

  it('preserves unsupported startup without retrying in main', async () => {
    vi.mocked(core.getInput).mockReturnValue('pre')
    vi.mocked(setup).mockResolvedValue(false)
    await run('pre')
    await run('main')
    expect(setup).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('supported', 'false')
    expect(state.get('cargowall-skipped')).toBe('true')
  })

  it('does not retry failed pre startup in main', async () => {
    vi.mocked(core.getInput).mockReturnValue('pre')
    vi.mocked(setup).mockRejectedValue(new Error('setup failed'))
    await run('pre')
    expect(core.setFailed).toHaveBeenCalledWith('setup failed')
    await run('main')
    expect(setup).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenLastCalledWith(expect.stringContaining('pre startup did not complete'))
  })

  it('rejects an invalid phase before running setup', async () => {
    vi.mocked(core.getInput).mockReturnValue('per')
    await run('pre')
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid start-phase'))
    expect(setup).not.toHaveBeenCalled()
  })
})
