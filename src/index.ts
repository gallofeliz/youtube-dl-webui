import runProcess, {Process} from '@gallofeliz/js-libs/process'
import createLogger from '@gallofeliz/js-libs/logger'
import HttpServer from '@gallofeliz/js-libs/http-server'
import loadConfig from '@gallofeliz/js-libs/config'
import { Job, JobsRunner } from '@gallofeliz/js-libs/jobs'
import { handleExitSignals } from '@gallofeliz/js-libs/exit-handle'
const { once } = require('events')
const tmpdir = require('os').tmpdir()
const config = loadConfig<Config, Config>({})
const logger = createLogger(config.loglevel as any || 'info')
const uuid4 = require('uuid').v4
const fs = require('fs')
const fsExtra = require('fs-extra')

interface Config {
    loglevel?: string
    port?: number
}

interface Download {
    urls: string[]
    uid: string
    onlyAudio: boolean
    ignorePlaylists: boolean
    status: 'YOUTUBE-QUEUE' | 'YOUTUBE-DOWNLOADING' | 'YOUTUBE-ERROR' | 'READY' | 'BROWSER-DOWNLOAD' | 'DONE' | 'CANCELED',
    youtubeJob: Job
    workdir: string,
    targetFile?: string
    autoBrowserDownload: boolean
    doneOrCanceledAt?: Date
    videoQuality: string
}

type DownloadRequest = Pick<Download, 'urls' | 'onlyAudio' | 'ignorePlaylists' | 'autoBrowserDownload' | 'videoQuality'>

const downloads: Download[] = []
const downloadManager = new JobsRunner({logger})

;(async () => {
    const httpServer = new HttpServer({
        logger,
        port: config.port || 80,
        webUiFilesPath: __dirname + '/..',
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
                                id: {
                                    operation: 'yt-download',
                                    trigger: null,
                                    subjects: {uid: uid}
                                },
                                logger,
                                async fn({logger, abortSignal}) {
                                    try {
                                        fs.mkdirSync(workdir)

                                        const format = (() => {
                                            if (download.onlyAudio) {
                                                // I can't accept bad audio !
                                                return
                                            }
                                            switch (download.videoQuality) {
                                                case 'best':
                                                    return 'bestvideo*+bestaudio/best'
                                                case 'fhd':
                                                    return 'bv*[height<=1080]+ba/b[height<=1080] / wv*+ba/w'
                                                case 'hd':
                                                    return 'bv*[height<=720]+ba/b[height<=720] / wv*+ba/w'
                                                // Less is useless !!!! Better only listen :)
                                                default:
                                                    throw new Error('Unknown videoQuality')
                                            }
                                        })()

                                        const downloadProcess = runProcess({
                                            cmd: 'yt-dlp',
                                            args: [
                                                ...download.urls,
                                                ...download.onlyAudio ? ['-x'] : [],
                                                ...format ? ['-f', format] : [],
                                                ...download.ignorePlaylists ? ['--no-playlist'] : [],
                                                '--abort-on-error'
                                            ],
                                            logger,
                                            cwd: workdir,
                                            abortSignal
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
                        download.youtubeJob.once('done',    () => download.status = 'READY')
                        download.youtubeJob.once('error',   () => {
                            if (download.youtubeJob.getState() === 'aborted') {
                                download.status = 'CANCELED'
                                download.doneOrCanceledAt = new Date
                            } else {
                                download.status = 'YOUTUBE-ERROR'
                            }
                            fsExtra.removeSync(download.workdir)
                        })

                        downloads.push(download)
                        downloadManager.run(download.youtubeJob)
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
                    path: '/cancel/:uid',
                    async handler(req, res) {
                        const uid = req.params.uid as string
                        const download = downloads.find(d => d.uid === uid)!

                        if (download.youtubeJob.getState() === 'new') {
                            download.youtubeJob.cancel('api canceled')
                        } else if (download.status === 'YOUTUBE-ERROR') {
                            download.status = 'CANCELED'
                            download.doneOrCanceledAt = new Date
                        } else {
                            download.youtubeJob.abort('api canceled')
                        }

                        // Shitty haha
                        await new Promise((resolve) => setTimeout(resolve, 50))
                        res.end()
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
                        download.doneOrCanceledAt = new Date

                        res.end()
                    }
                }
            ]
        }
    })

    await httpServer.start()
    downloadManager.start()
    logger.info('Started !')

    function removeOldDownloads() {
        const currentDate = (new Date).getTime()

        const toRemove = downloads.filter(download => {
            if (!download.doneOrCanceledAt) {
                return false
            }

            return download.doneOrCanceledAt.getTime() + (1000 * 60 * 5) < currentDate
        })

        toRemove.forEach(download => {
            downloads.splice(downloads.indexOf(download), 1)
        })
    }

    const removeOldDownloadsInterval = setInterval(removeOldDownloads, 1000 * 60)

    handleExitSignals(() => {
        logger.info('Exit Signal received. Stopping...')
        httpServer.stop()
        downloadManager.stop()
        clearInterval(removeOldDownloadsInterval)
    })

})()
