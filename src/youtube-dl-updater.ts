import runProcess, {Process} from '@gallofeliz/js-libs/process'
import createLogger from '@gallofeliz/js-libs/logger'
const logger = createLogger('info')
const { once } = require('events')

import { handleExitSignals } from '@gallofeliz/js-libs/exit-handle'

let updateProcess: Process | null

async function updateYtdl() {
    if (updateProcess) {
        logger.warning('Update already running ???')
        return
    }

    updateProcess = runProcess({
        cmd: 'yt-dlp',
        args: ['--update'],
        logger,
        outputType: 'text'
    })

    try {
        await once(updateProcess, 'finish')
    } catch (e) {
        logger.warning('Update failed', {e})
    } finally {
        updateProcess = null
    }
}

const updateInterval = setInterval(updateYtdl, 1000 * 60 * 60 * 24) // 1 day

updateYtdl()

handleExitSignals(() => {
    logger.info('Exit Signal received. Stopping...')
    clearInterval(updateInterval)
    if (updateProcess) {
        updateProcess.abort()
    }
})
