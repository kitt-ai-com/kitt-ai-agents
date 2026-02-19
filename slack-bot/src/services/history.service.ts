import fs from 'node:fs';
import path from 'node:path';
import type { ConversationMessage } from '../types.js';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'conversations.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'channel-settings.json');

const MAX_MESSAGES_PER_THREAD = 20;

interface ThreadData {
  team: string | null;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

/** 스레드 키 생성 */
function threadKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

/** 데이터 로드 */
function loadData(): Record<string, ThreadData> {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
  } catch {
    // 파일 손상 시 빈 데이터로 시작
  }
  return {};
}

/** 데이터 저장 */
function saveData(data: Record<string, ThreadData>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** DB 초기화 (앱 시작 시 1회 호출) */
export function initDatabase(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, '{}', 'utf-8');
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, '{}', 'utf-8');
  }
}

/** 메시지 저장 */
export function saveMessage(
  channelId: string,
  threadTs: string,
  team: string | null,
  role: 'user' | 'assistant',
  content: string,
): void {
  const data = loadData();
  const key = threadKey(channelId, threadTs);

  if (!data[key]) {
    data[key] = { team, messages: [] };
  }

  if (team && !data[key].team) {
    data[key].team = team;
  }

  data[key].messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  // 최대 메시지 수 제한
  if (data[key].messages.length > MAX_MESSAGES_PER_THREAD) {
    data[key].messages = data[key].messages.slice(-MAX_MESSAGES_PER_THREAD);
  }

  saveData(data);
}

/** 스레드의 대화 이력을 가져온다 */
export function getHistory(channelId: string, threadTs: string): ConversationMessage[] {
  const data = loadData();
  const key = threadKey(channelId, threadTs);
  const thread = data[key];

  if (!thread) return [];

  return thread.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/** 스레드의 팀 컨텍스트를 가져온다 */
export function getThreadTeam(channelId: string, threadTs: string): string | null {
  const data = loadData();
  const key = threadKey(channelId, threadTs);
  return data[key]?.team ?? null;
}

// ─── 채널-팀 설정 ───

function loadSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

/** 채널에 팀을 설정한다 */
export function setChannelTeam(channelId: string, teamKey: string): void {
  const settings = loadSettings();
  settings[channelId] = teamKey;
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/** 채널에 설정된 팀을 가져온다 */
export function getChannelTeamSetting(channelId: string): string | null {
  return loadSettings()[channelId] || null;
}

/** 채널의 팀 설정을 해제한다 */
export function clearChannelTeam(channelId: string): void {
  const settings = loadSettings();
  delete settings[channelId];
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}
