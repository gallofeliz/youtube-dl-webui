const runProcess = require('js-libs/process').default
const createLogger = require('js-libs/logger').default
const HttpServer = require('js-libs/http-server').default
const loadConfig = require('js-libs/config').default
import { Job, JobsManager } from 'js-libs/jobs'
const { handleExitSignals } = require('js-libs/exit-handle')
const { once } = require('events')
const tmpdir = require('os').tmpdir()
const config = loadConfig({})
const logger = createLogger(config.loglevel || 'info')
const uuid4 = require('uuid').v4
const fs = require('fs')
const fsExtra = require('fs-extra')

interface Download {
    urls: string[]
    uid: string
    onlyAudio: boolean
    ignorePlaylists: boolean
    status: 'YOUTUBE-QUEUE' | 'YOUTUBE-DOWNLOADING' | 'YOUTUBE-ERROR' | 'READY' | 'BROWSER-DOWNLOAD' | 'DONE',
    youtubeJob: Job
    workdir: string,
    targetFile?: string
    autoBrowserDownload: boolean
}

type DownloadRequest = Pick<Download, 'urls' | 'onlyAudio' | 'ignorePlaylists' | 'autoBrowserDownload'>

const downloads: Download[] = []
const downloadManager = new JobsManager(logger)

;(async () => {
    const httpServer = new HttpServer({
        logger,
        port: config.port || 80,
        webUiFilesPath: __dirname,
        api: {
            routes: [
                {
                    method: 'post',
                    path: '/download',
                    async handler(req, res) {
                        const uid = uuid4()
                        const workdir = tmpdir + '/' + uid

                        const download: Download = {
                            ...req.body as DownloadRequest,
                            uid,
                            workdir,
                            status: 'YOUTUBE-QUEUE',
                            youtubeJob: new Job({
                                operation: 'yt-download',
                                trigger: null,
                                subjects: {uid: uid},
                                logger,
                                async fn(job) {
                                    try {
                                        fs.mkdirSync(workdir)

                                        const downloadProcess = runProcess({
                                            cmd: 'yt-dlp',
                                            args: [
                                                ...download.urls,
                                                ...download.onlyAudio ? ['-x'] : [],
                                                ...download.ignorePlaylists ? ['--no-playlist'] : [],
                                                '--abort-on-error'
                                            ],
                                            logger: job.getLogger(),
                                            cwd: workdir
                                        })

                                        await once(downloadProcess, 'finish')

                                        const files = fs.readdirSync(workdir)
                                        const needZip = files.length > 1

                                        if (needZip) {
                                            const tarProcess = runProcess({
                                                cwd: workdir,
                                                logger,
                                                cmd: 'tar',
                                                args: ['-cf', 'videos.tar', ...files]
                                            })

                                            await once(tarProcess, 'finish')

                                            download.targetFile = 'videos.tar'

                                            // clean the files as soon as possible to free space
                                            files.forEach((file: string) => {
                                                fs.unlinkSync(workdir + '/' + file)
                                            })
                                        } else {
                                            download.targetFile = files[0]
                                        }

                                    } catch (e) {
                                        fsExtra.removeSync(workdir)
                                        throw e
                                    }
                                }
                            })
                        }

                        download.youtubeJob.once('running', () => download.status = 'YOUTUBE-DOWNLOADING')
                        download.youtubeJob.once('success', () => download.status = 'READY')
                        download.youtubeJob.once('failure', () => download.status = 'YOUTUBE-ERROR')

                        downloads.push(download)
                        downloadManager.addJob(download.youtubeJob)
                        res.end()
                    }
                },
                {
                    method: 'get',
                    path: '/downloads',
                    async handler(req, res) {
                        res.json(downloads)
                    }
                },
                {
                    method: 'get',
                    path: '/download/:uid',
                    async handler(req, res) {
                        const uid = req.params.uid as string
                        const download = downloads.find(d => d.uid === uid)!

                        download.autoBrowserDownload = false

                        download.status = 'BROWSER-DOWNLOAD'

                        res.header('Content-Disposition', 'attachment; filename="'+encodeURIComponent(download.targetFile!)+'"')
                        const fullPath = download.workdir + '/' + download.targetFile!
                        const stats = fs.statSync(fullPath)
                        res.header('Content-Length', stats.size.toString())

                        const readStream = fs.createReadStream(fullPath);
                        readStream.pipe(res)

                        await once(readStream, 'close')

                        fsExtra.removeSync(download.workdir)
                        download.status = 'DONE'

                        // Bad way ... Blocks the process stop
                        setTimeout(() => {
                            downloads.splice(downloads.indexOf(download), 1)
                        }, 1000 * 60)

                        res.end()
                    }
                }
            ]
        }
    })

    await httpServer.start()
    downloadManager.start()
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
        downloadManager.stop()
        clearInterval(updateInterval)
        if (updateProcess) {
            updateProcess.abort()
        }
    })

})()
