import { TEAMS } from '../config.js';
import { readClaudeMd } from './claudemd.service.js';
import { reviewWithClaude } from './claude.service.js';
import type { PendingRegistration } from '../types.js';

/**
 * 등록 대기 목록.
 * 키: `${channelId}:${messageTs}` (검토 결과 메시지의 ts)
 */
export const pendingRegistrations = new Map<string, PendingRegistration>();

/**
 * 학습/기준 등록 검토를 수행하고 Slack Block Kit 메시지를 반환한다.
 */
export async function buildReviewMessage(
  teamKey: string,
  type: 'learning' | 'standard',
  content: string,
  userId: string,
  channelId: string,
  threadTs: string,
): Promise<{ text: string; blocks: any[] }> {
  const team = TEAMS[teamKey];
  const systemPrompt = readClaudeMd(teamKey);
  const typeLabel = type === 'learning' ? '💡 학습' : '⛔ 기준';

  // Claude로 검토 요청
  const reviewText = await reviewWithClaude(systemPrompt, type, content);

  // 개선안 추출 시도 (간단한 패턴 매칭)
  const improvedMatch = reviewText.match(/개선안:\s*(.+?)(?:\n|$)/);
  const improved = improvedMatch ? improvedMatch[1].trim() : null;

  // 고유 액션 ID 생성
  const actionId = `review_${Date.now()}`;

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${team.emoji} *${team.name}* - ${typeLabel} 등록 검토`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: reviewText,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'actions',
      block_id: actionId,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '1️⃣ 원본 그대로 등록' },
          action_id: 'register_original',
          style: 'primary',
          value: actionId,
        },
        ...(improved
          ? [
              {
                type: 'button' as const,
                text: { type: 'plain_text' as const, text: '2️⃣ 개선안으로 등록' },
                action_id: 'register_improved',
                style: 'primary' as const,
                value: actionId,
              },
            ]
          : []),
        {
          type: 'button',
          text: { type: 'plain_text', text: '3️⃣ 직접 수정 후 등록' },
          action_id: 'register_custom',
          value: actionId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '4️⃣ 취소' },
          action_id: 'register_cancel',
          style: 'danger',
          value: actionId,
        },
      ],
    },
  ];

  // 등록 대기 데이터 저장
  pendingRegistrations.set(actionId, {
    teamKey,
    type,
    original: content,
    improved,
    userId,
    channelId,
    threadTs,
  });

  return {
    text: `${typeLabel} 등록 검토 결과`,
    blocks,
  };
}
