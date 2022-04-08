FROM node:alpine3.12

RUN apk add --no-cache python3 tzdata ffmpeg

RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD index.js index.html ./

USER nobody
CMD node .
