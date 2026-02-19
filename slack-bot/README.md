# 🤖 AI 에이전트 슬랙봇

슬랙에서 팀 에이전트와 대화하고, 학습/기준을 등록할 수 있는 봇입니다.

## 사전 준비

### 1. Slack 앱 생성

1. [Slack API](https://api.slack.com/apps)에서 **Create New App** → **From scratch**
2. 앱 이름 설정 (예: `ai`, `봇`, `에이전트` 등 짧은 이름 권장)
3. 워크스페이스 선택

### 2. 권한 설정

**OAuth & Permissions** → **Bot Token Scopes**에 추가:

- `app_mentions:read` - 멘션 읽기
- `chat:write` - 메시지 보내기
- `im:history` - DM 이력 읽기
- `channels:history` - 채널 이력 읽기

### 3. Socket Mode 활성화

1. **Socket Mode** → **Enable Socket Mode** ON
2. App-Level Token 생성 (scope: `connections:write`) → `xapp-...` 토큰 저장

### 4. 이벤트 구독

**Event Subscriptions** → **Enable Events** ON → **Subscribe to bot events**:

- `app_mention` - 앱 멘션 이벤트

### 5. Interactivity 활성화

**Interactivity & Shortcuts** → **Interactivity** ON
(Socket Mode 사용 시 Request URL은 자동 처리됨)

### 6. 앱 설치

**Install App** → **Install to Workspace** → `xoxb-...` 토큰 저장

## 설치 및 실행

```bash
cd slack-bot

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일을 열어 토큰들을 입력

# 실행
npm start

# 개발 모드 (파일 변경 시 자동 재시작)
npm run dev
```

## 사용법

슬랙 채널에서 봇을 멘션하여 사용합니다.

### 질문

```
@봇 마케팅 메타 광고 캠페인 기획해줘
@봇 mk 광고 기획해줘          ← 짧은 별칭 사용
@봇 dev API 설계 도와줘
@봇 매출 분석해줘              ← 팀명 없으면 CEO가 처리
```

### 학습 등록

```
@봇 마케팅-학습 리뷰 카루셀이 CTR 2배 높음
@봇 mk-학습 리뷰 카루셀이 CTR 2배 높음
```

### 기준 등록

```
@봇 마케팅-기준 건기식은 식약처 기준 준수
```

### 목록 조회

```
@봇 마케팅-학습목록
@봇 마케팅-기준목록
```

### 스레드 대화

스레드 안에서 멘션하면 같은 팀 컨텍스트를 유지합니다.

## 팀 별칭

| 정식 이름 | 짧은 별칭 (한국어) | 짧은 별칭 (영문) |
|---|---|---|
| 마케팅 | 마케 | mk |
| 콘텐츠 | 콘텐 | ct |
| 디자인 | 디자 | ds |
| 개발 | - | dev |
| 이커머스 | 이커 | ec |
| 재무 | - | fn |
| 전략 | - | st |
| 에이전트컨설팅 | 컨설 | ac |

## 환경변수

| 변수 | 설명 | 예시 |
|---|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token | `xoxb-...` |
| `SLACK_APP_TOKEN` | App-Level Token (Socket Mode) | `xapp-...` |
| `SLACK_SIGNING_SECRET` | Signing Secret | |
| `ANTHROPIC_API_KEY` | Claude API 키 | `sk-ant-...` |
| `CLAUDE_MODEL` | 사용할 모델 | `claude-sonnet-4-5-20250929` |
| `AGENTS_ROOT_PATH` | CLAUDE.md 파일 루트 경로 | `../` |

## 아키텍처

```
슬랙 워크스페이스
  ↕ (Socket Mode WebSocket)
slack-bot/ (Node.js + TypeScript)
  ├── mention.handler  → 명령어 파싱 → 팀 라우팅
  ├── claude.service   → CLAUDE.md → Claude API 호출
  ├── review.service   → 학습/기준 등록 검토 플로우
  ├── claudemd.service → CLAUDE.md 읽기/쓰기
  └── history.service  → SQLite 대화 이력 관리
```
