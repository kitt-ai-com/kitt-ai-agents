import type { WebClient } from '@slack/web-api';
import { resolveTeamByChannel } from '../config.js';
import { getChannelTeamSetting } from './history.service.js';

/** 채널 ID → 이름 캐시 */
const channelNameCache = new Map<string, string>();

let slackClient: WebClient;

/** Slack 클라이언트 설정 (앱 시작 시 1회 호출) */
export function initChannelService(client: WebClient): void {
  slackClient = client;
}

/** 채널 ID로 채널 이름을 조회한다 (캐시 사용) */
async function getChannelName(channelId: string): Promise<string | null> {
  if (channelNameCache.has(channelId)) {
    return channelNameCache.get(channelId)!;
  }

  try {
    const result = await slackClient.conversations.info({ channel: channelId });
    const name = (result.channel as any)?.name || null;
    console.log(`[채널 조회] ${channelId} → ${name}`);
    if (name) {
      channelNameCache.set(channelId, name);
    }
    return name;
  } catch (err: any) {
    console.error(`[채널 조회 실패] ${channelId}:`, err?.data?.error || err?.message || err);
    return null;
  }
}

/** 채널 ID로 팀 키를 추론한다 (DB 설정 → 채널 이름 순) */
export async function resolveTeamByChannelId(channelId: string): Promise<string | null> {
  // 1. DB에 저장된 채널 설정 확인
  const dbTeam = getChannelTeamSetting(channelId);
  if (dbTeam) {
    console.log(`[팀 추론] ${channelId} → DB 설정: ${dbTeam}`);
    return dbTeam;
  }

  // 2. 채널 이름으로 자동 매칭
  const name = await getChannelName(channelId);
  if (!name) {
    console.log(`[팀 추론] ${channelId} → 채널 이름 조회 실패`);
    return null;
  }
  const team = resolveTeamByChannel(name);
  console.log(`[팀 추론] ${channelId} → 채널: ${name} → 팀: ${team}`);
  return team;
}
