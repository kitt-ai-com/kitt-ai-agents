import 'dotenv/config';
import type { TeamConfig } from './types.js';

/** 환경변수 */
export const ENV = {
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN!,
  SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN!,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET!,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
  AGENTS_ROOT_PATH: process.env.AGENTS_ROOT_PATH || '../',
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
};

/** 팀 설정 맵 (키: 정식 이름) */
export const TEAMS: Record<string, TeamConfig> = {
  마케팅: {
    name: '마케팅팀',
    folder: 'marketing',
    claudeMdPath: 'marketing/CLAUDE.md',
    emoji: '📢',
  },
  콘텐츠: {
    name: '콘텐츠팀',
    folder: 'content',
    claudeMdPath: 'content/CLAUDE.md',
    emoji: '✍️',
  },
  디자인: {
    name: '디자인팀',
    folder: 'design',
    claudeMdPath: 'design/CLAUDE.md',
    emoji: '🎨',
  },
  개발: {
    name: '개발팀',
    folder: 'development',
    claudeMdPath: 'development/CLAUDE.md',
    emoji: '💻',
  },
  이커머스: {
    name: '이커머스팀',
    folder: 'ecommerce',
    claudeMdPath: 'ecommerce/CLAUDE.md',
    emoji: '🛒',
  },
  재무: {
    name: '재무/경영지원팀',
    folder: 'finance-ops',
    claudeMdPath: 'finance-ops/CLAUDE.md',
    emoji: '💰',
  },
  전략: {
    name: '전략기획실',
    folder: 'strategic-hq',
    claudeMdPath: 'strategic-hq/CLAUDE.md',
    emoji: '📋',
  },
  에이전트컨설팅: {
    name: '에이전트 컨설팅팀',
    folder: 'agent-consulting',
    claudeMdPath: 'agent-consulting/CLAUDE.md',
    emoji: '🤖',
  },
};

/** 짧은 별칭 → 정식 팀 키 매핑 */
export const TEAM_ALIASES: Record<string, string> = {
  // 한국어 축약
  마케: '마케팅',
  콘텐: '콘텐츠',
  디자: '디자인',
  이커: '이커머스',
  컨설: '에이전트컨설팅',
  // 영문 축약
  mk: '마케팅',
  ct: '콘텐츠',
  ds: '디자인',
  dev: '개발',
  ec: '이커머스',
  fn: '재무',
  st: '전략',
  ac: '에이전트컨설팅',
};

/** 별칭 또는 정식 이름으로 팀 키를 찾는다 */
export function resolveTeamKey(input: string): string | null {
  const normalized = input.trim();
  if (TEAMS[normalized]) return normalized;
  if (TEAM_ALIASES[normalized]) return TEAM_ALIASES[normalized];
  return null;
}

/**
 * 채널 이름 → 팀 키 매핑
 * 채널 이름에 팀 별칭이 포함되면 자동으로 해당 팀으로 인식한다.
 * 예: #ct → 콘텐츠, #mk-general → 마케팅
 */
export const CHANNEL_TEAM_MAP: Record<string, string> = {
  ct: '콘텐츠',
  mk: '마케팅',
  ds: '디자인',
  dev: '개발',
  ec: '이커머스',
  fn: '재무',
  st: '전략',
  ac: '에이전트컨설팅',
  content: '콘텐츠',
  marketing: '마케팅',
  design: '디자인',
  development: '개발',
  ecommerce: '이커머스',
  finance: '재무',
  strategic: '전략',
  consulting: '에이전트컨설팅',
};

/** 채널 이름으로 팀 키를 추론한다 */
export function resolveTeamByChannel(channelName: string): string | null {
  const name = channelName.toLowerCase();
  // 정확히 일치
  if (CHANNEL_TEAM_MAP[name]) return CHANNEL_TEAM_MAP[name];
  // 채널 이름이 팀 별칭으로 시작하는 경우 (예: ct-general, mk-campaign)
  for (const [prefix, teamKey] of Object.entries(CHANNEL_TEAM_MAP)) {
    if (name.startsWith(prefix + '-') || name.startsWith(prefix + '_')) {
      return teamKey;
    }
  }
  return null;
}

/** CEO 오케스트레이터 CLAUDE.md 경로 */
export const CEO_CLAUDE_MD_PATH = 'CLAUDE.md';
