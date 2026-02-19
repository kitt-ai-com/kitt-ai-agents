FROM node:20-alpine

# git 설치 (자동 커밋용)
RUN apk add --no-cache git

WORKDIR /app

# 슬랙봇 의존성 설치
COPY slack-bot/package.json slack-bot/package-lock.json* slack-bot/
RUN cd slack-bot && npm install

# 전체 프로젝트 복사 (CLAUDE.md 파일들 포함)
COPY . .

# git 안전 디렉토리 설정
RUN git config --global safe.directory /app

WORKDIR /app/slack-bot

CMD ["npm", "start"]
