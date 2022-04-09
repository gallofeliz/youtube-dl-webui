const runProcess = require('js-libs/process').default
const createLogger = require('js-libs/logger').default
const HttpServer = require('js-libs/http-server').default
const loadConfig = require('js-libs/config').default
const { handleExitSignals } = require('js-libs/exit-handle')
const { once } = require('events')
const tmpdir = require('os').tmpdir()
const config = loadConfig({})
const logger = createLogger(config.loglevel || 'info')
const uuid4 = require('uuid').v4
const fs = require('fs')
const glob = require('glob')

;(async () => {
    const httpServer = new HttpServer({
        logger,
        port: config.port || 80,
        webUiFilesPath: __dirname,
        api: {
            routes: [
                {
                    method: 'get',
                    path: '/download',
                    async handler(req, res) {
                        const url = req.query.url
                        const type = req.query.type || 'video'
                        const audioOnly = type === 'audio'

                        let currentProcess
                        let tmpPath
                        let userStop = false
                        let readStream

                        const close = () => {
                            userStop = true
                            if (currentProcess) {
                                currentProcess.abort()
                            }
                            if (readStream) {
                                readStream.close()
                            }
                            if (tmpPath) {
                                const pattern = tmpPath.substring(0, tmpPath.lastIndexOf('.') + 1) + '*'
                                glob.sync(pattern).forEach(file => fs.unlinkSync(file))
                            }
                        }

                        req.once('close', close)

                        try {
                            // Get infos
                            currentProcess = runProcess({
                                cmd: 'yt-dlp',
                                args: (audioOnly ? ['-x'] : []).concat([
                                    url,
                                    '--print', 'filename',
                                    '--print', 'format_id',
                                    '--print', 'filesize',
                                    '--print', 'ext',
                                    '--no-playlist'
                                ]),
                                logger,
                                outputType: 'multilineText'
                            })

                            const [result] = await once(currentProcess, 'finish')
                            currentProcess = null

                            const [filename, formatIds, filesize, extension] = [
                                result[0],
                                result[1].split('+'),
                                result[2] === 'NA' ? null : parseInt(result[2], 10),
                                result[3]
                            ]

                            res.header('Content-Disposition', 'attachment; filename="'+encodeURIComponent(filename)+'"')

                            if (filesize) {
                               res.header('Content-Length', filesize.toString())
                            }

                            if (formatIds.length === 1) {

                                currentProcess = runProcess({
                                    cmd: 'yt-dlp',
                                    args: ['-f', formatIds[0], url, '-o', '-', '--no-playlist'],
                                    logger,
                                    outputStream: res
                                })

                                await once(currentProcess, 'finish')
                                currentProcess = null
                            } else {

                                tmpPath = tmpdir + '/' + uuid4() + '.' + extension

                                currentProcess = runProcess({
                                    cmd: 'yt-dlp',
                                    args: ['-f', formatIds.join('+'), url, '-o', tmpPath],
                                    logger,
                                    outputType: 'text'
                                })

                                await once(currentProcess, 'finish')
                                currentProcess = null

                                if (!filesize) {
                                    const stats = fs.statSync(tmpPath)
                                    res.header('Content-Length', stats.size.toString())
                                }

                                readStream = fs.createReadStream(tmpPath);
                                readStream.pipe(res)

                                await once(readStream, 'close')
                                readStream = null
                                fs.unlinkSync(tmpPath)
                                tmpPath = null
                            }

                        } catch (e) {
                            if (!userStop) {
                                throw e
                            }
                        } finally {
                            req.off('close', close)
                        }

                        res.end()
                    }
                },
                // {
                //     method: 'get',
                //     path: '/playlist-videos-urls',
                //     async handler(req, res) {
                //         const url = req.query.url

                //         currentProcess = runProcess({
                //             cmd: 'yt-dlp',
                //             args: [
                //                 url,
                //                 '--print', 'original_url',
                //                 '--flat-playlist'
                //             ],
                //             logger,
                //             outputType: 'multilineText'
                //         })

                //         const [result] = await once(currentProcess, 'finish')

                //         res.json(result)
                //     }
                // }
            ]
        }
    })

    await httpServer.start()
    logger.info('Started !')

    let updateProcess

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
        httpServer.stop()
        clearInterval(updateInterval)
        if (updateProcess) {
            updateProcess.abort()
        }
    })

})()
