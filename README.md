# youtube-dl-stream-webui

Keys: download videos and audio for many platforms + webui + multi urls and playlists + download to your browser + ytb-dl auto-update + Docker native + light + Raspberry PI Compatible

A simple Web UI to download Video/Sound from youtube and others platforms. NOT a download manager (you can use Aria or others !).

## Notice

To handle multi urls, playlist and to offer the best video/sound quality, the app doesn't stream directly anymore. It will prepare the files and download the build.

Note that the prepare time can take a long time and your browser will wait. It is possible the browser triggers a timeout and if it's the case, we have to find a solution (regular http 100 ?). If it's not possible, we will need to create a tempory link but it will complexify the process (currently all the session is attached to the http request)

If browser waiting is not a good solution for the futur, a solution should be to have "jobs" with first yt-download operation, then browser triggers download to him and then the session is cleaned. It will be an intermediate solution between the very simple "this app is a proxy" and a full download manager.

![DEMO](demo.gif)

## Alternatives

- The CLI tool (That makes 99% of the job) : https://github.com/yt-dlp/yt-dlp
- WebUIs :
  - https://github.com/d0u9/youtube-dl-webui
  - https://github.com/timendum/Youtube-dl-WebUI
  - https://github.com/manbearwiz/youtube-dl-server
  - https://github.com/Tzahi12345/YoutubeDL-Material
  - https://github.com/Rudloff/alltube
- Some GUIs are also available
