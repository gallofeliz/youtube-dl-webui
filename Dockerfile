FROM node:alpine3.12

RUN apk add --no-cache python3 tzdata ffmpeg

RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && chown nobody /usr/local/bin/yt-dlp
# I don't like a lot a binary to be updatable by the run user ... But we want to ensure
# the binary to be updated to support platforms, and we don't want to have a root index.js
# with sub app with another user (keep it simple)

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD src tsconfig.json ./

RUN npx tsc

RUN ls -la

ADD index.html ./

USER nobody
CMD node dist
