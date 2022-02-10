const runProcess = require('js-libs/process').default
const createLogger = require('js-libs/logger').default
const HttpServer = require('js-libs/http-server').default
const { once } = require('events')

const logger = createLogger('info')

const httpServer = new HttpServer({
    logger,
    port: 80,
    webUiFilesPath: __dirname,
    api: {
        routes: [
            {
                method: 'get',
                path: '/download',
                async handler(req, res) {
                    const url = req.query.url
                    const type = req.query.type || 'video'

                    const process = runProcess({
                        cmd: 'yt-dlp',
                        args: type === 'audio' ? ['-j', '-x', url] : ['-j', url],
                        logger: createLogger('info'),
                        outputType: 'json'
                    })

                    const [result] = await once(process, 'finish')

                    res.header('Content-Disposition', 'attachment; filename="'+encodeURIComponent(result._filename)+'"')

                    if (type === 'audio') {
                        res.header('Content-Length', result.filesize.toString())
                    }

                    const process2 = runProcess({
                        cmd: 'yt-dlp',
                        args:  type === 'audio' ? ['-f', result.format_id, url, '-o', '-'] : [url, '-o', '-'],
                        logger: createLogger('info'),
                        outputStream: res
                    })

                    let userStop = false

                    const close = () => {
                        userStop = true
                        process2.abort()
                    }

                    req.once('close', close)

                    try {
                        await once(process2, 'finish')
                    } catch (e) {
                        if (!userStop) {
                            throw e
                        }
                    } finally {
                        req.off('close', close)
                    }

                    res.end()
                }
            }
        ]
    }
})

httpServer.start()

process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Stopping...')
    httpServer.stop()
})
