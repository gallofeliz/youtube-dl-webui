FROM node:lts-alpine3.18

RUN apk add --no-cache tzdata ffmpeg supervisor && wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod +x /usr/local/bin/yt-dlp

RUN apk add --no-cache py3-pip && python3 -m pip install mutagen

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD src tsconfig.json ./

RUN npx tsc

RUN ls -la

ADD index.html logo_w300.jpeg ./

COPY supervisord.conf /etc/supervisor.d/supervisord.ini

CMD ["supervisord", "-c", "/etc/supervisor.d/supervisord.ini"]

HEALTHCHECK --interval=1m --retries=3 CMD test $(ps | grep node | grep -v grep | wc -l) -ge 2
# Todo use supervisorctl (but not succeded)
