FROM node:lts-alpine3.18

RUN apk add --no-cache tzdata ffmpeg supervisor yt-dlp

WORKDIR /app

ADD package.json package-lock.json ./

RUN npm i

ADD src tsconfig.json ./

RUN npx tsc

RUN ls -la

ADD index.html ./

COPY supervisord.conf /etc/supervisor.d/supervisord.ini

CMD ["supervisord", "-c", "/etc/supervisor.d/supervisord.ini"]

HEALTHCHECK --interval=1m --retries=3 CMD test $(ps | grep node | grep -v grep | wc -l) -ge 2
# Todo use supervisorctl (but not succeded)
