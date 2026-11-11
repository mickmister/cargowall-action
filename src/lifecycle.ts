import * as core from '@actions/core'
import { setup } from './setup'
import { start } from './start'

const START_RESULT = 'cargowall-start-result'

export async function run(phase: 'pre' | 'main'): Promise<void> {
  try {
    const startPhase = core.getInput('start-phase') || 'main'
    if (startPhase !== 'pre' && startPhase !== 'main') {
      throw new Error(`Invalid start-phase "${startPhase}" — expected "pre" or "main".`)
    }

    if (phase === 'pre' && startPhase === 'main') return

    if (phase === 'main' && startPhase === 'pre') {
      // Pre and main run in separate processes. Re-publish outputs for callers
      // without downloading/restarting or retrying a partially failed setup.
      const saved = core.getState(START_RESULT)
      if (!saved) throw new Error('CargoWall pre startup did not complete; refusing to start it again in main.')
      const result = JSON.parse(saved) as { supported: boolean; pid: number | null }
      core.setOutput('supported', String(result.supported))
      if (result.pid !== null) core.setOutput('pid', result.pid)
      return
    }

    if (!await setup()) {
      core.setOutput('supported', 'false')
      core.saveState('cargowall-skipped', 'true')
      core.saveState(START_RESULT, JSON.stringify({ supported: false, pid: null }))
      return
    }

    // start() still owns process state for the existing post hook.
    const result = await start()
    core.saveState(START_RESULT, JSON.stringify(result))
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
