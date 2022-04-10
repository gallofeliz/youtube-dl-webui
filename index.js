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
const fsExtra = require('fs-extra')

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
                        const urls = req.query.urls.split('\n').map(v => v.trim()).filter(v => v)
                        const audioOnly = req.query.onlyAudio === 'true' ? true : false
                        const ignorePlaylists = req.query.ignorePlaylists === 'true' ? true : false

                        const sessionId = uuid4()
                        const sessionPath = tmpdir + '/' + sessionId

                        const cleanUp = []

                        let userStop = false

                        function doCleanUp() {
                            cleanUp.reverse().forEach(fn => fn())
                            cleanUp.splice(0, cleanUp.length)
                        }

                        try {
                            const onReqClose = () => {
                                userStop = true
                                doCleanUp()
                                res.end() // Not sure is usefull but to avoid memory leak
                            }

                            req.once('close', onReqClose)

                            fs.mkdirSync(sessionPath)
                            cleanUp.push(() => { fsExtra.removeSync(sessionPath) })

                            const downloadProcess = runProcess({
                                cmd: 'yt-dlp',
                                args: [
                                    ...urls,
                                    ...audioOnly ? ['-x'] : [],
                                    ...ignorePlaylists ? ['--no-playlist'] : []
                                ],
                                logger,
                                cwd: sessionPath
                            })

                            cleanUp.push(() => downloadProcess.abort())
                            await once(downloadProcess, 'finish')
                            cleanUp.pop()

                            const files = fs.readdirSync(sessionPath)
                            const needZip = files.length > 1

                            if (needZip) {
                                const tarProcess = runProcess({
                                    cwd: sessionPath,
                                    logger,
                                    cmd: 'tar',
                                    args: ['-cf', 'build.tar', ...files]
                                })

                                cleanUp.push(() => tarProcess.abort())
                                await once(tarProcess, 'finish')
                                cleanUp.pop()
                            }

                            res.header('Content-Disposition', 'attachment; filename="'+encodeURIComponent(needZip ? 'videos.tar' : files[0])+'"')

                            const stats = fs.statSync(sessionPath + '/' + (needZip ? 'build.tar' : files[0]))
                            res.header('Content-Length', stats.size.toString())

                            const readStream = fs.createReadStream(sessionPath + '/' + (needZip ? 'build.tar' : files[0]));
                            readStream.pipe(res)

                            cleanUp.push(() => readStream.close())
                            await once(readStream, 'close')
                            cleanUp.pop()

                            doCleanUp()

                            req.off('close', onReqClose)
                            res.end()


                        } catch (e) {
                            if (!userStop) {
                                doCleanUp()
                                throw e
                            }
                        }
                    }
                }
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
