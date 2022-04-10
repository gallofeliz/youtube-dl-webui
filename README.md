# youtube-dl-stream-webui

Notes : I am developing new versions with multiline urls to download multiple videos and/or playlists. To reduce code complexity, I will remove the direct stream for 1 video with one remote file (1 formatId), that is valid usually only for 1 audio file (with best quality)

For lazy people : download videos and audio for many platforms + webui + direct stream to your browser + ytb-dl auto-update + Docker native + light + Raspberry PI Compatible

A simple Web UI to download Video/Sound from youtube and others platforms. NOT a download manager (you can use Aria or others !).

If possible, it will stream directly from Youtube (or others websites) to your browser, else will download the file and stream to your browser. In this last case, the browser can wait a long time before receive data (can be a problem with big videos ?).

Uses yt-dlp, and updates it each day

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
