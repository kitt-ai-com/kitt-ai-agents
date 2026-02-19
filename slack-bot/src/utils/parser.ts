import { resolveTeamKey } from '../config.js';
import type { ParsedCommand, CommandType } from '../types.js';

/**
 * 멘션 텍스트를 파싱하여 팀, 명령유형, 본문을 분리한다.
 *
 * 패턴:
 *   "마케팅 광고 기획해줘"        → { teamKey: '마케팅', type: 'question', body: '광고 기획해줘' }
 *   "mk 광고 기획해줘"           → { teamKey: '마케팅', type: 'question', body: '광고 기획해줘' }
 *   "마케팅-학습 CTR 높은 방법"   → { teamKey: '마케팅', type: 'learning', body: 'CTR 높은 방법' }
 *   "마케팅-기준 식약처 준수"     → { teamKey: '마케팅', type: 'standard', body: '식약처 준수' }
 *   "마케팅-학습목록"             → { teamKey: '마케팅', type: 'learning-list', body: '' }
 *   "마케팅-기준목록"             → { teamKey: '마케팅', type: 'standard-list', body: '' }
 *   "매출 분석해줘"              → { teamKey: null, type: 'question', body: '매출 분석해줘' }
 */
export function parseCommand(text: string): ParsedCommand {
  // 슬랙 멘션 태그 제거: <@U12345> 형태
  const cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim();

  if (!cleaned) {
    return { teamKey: null, type: 'question', body: '' };
  }

  // 첫 토큰 추출
  const spaceIdx = cleaned.indexOf(' ');
  const firstToken = spaceIdx === -1 ? cleaned : cleaned.substring(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : cleaned.substring(spaceIdx + 1).trim();

  // "팀명-학습목록", "팀명-기준목록" 체크
  const listMatch = firstToken.match(/^(.+)-(학습목록|기준목록)$/);
  if (listMatch) {
    const teamKey = resolveTeamKey(listMatch[1]);
    if (teamKey) {
      const type: CommandType = listMatch[2] === '학습목록' ? 'learning-list' : 'standard-list';
      return { teamKey, type, body: '' };
    }
  }

  // "팀명-학습", "팀명-기준" 체크
  const cmdMatch = firstToken.match(/^(.+)-(학습|기준)$/);
  if (cmdMatch) {
    const teamKey = resolveTeamKey(cmdMatch[1]);
    if (teamKey) {
      const type: CommandType = cmdMatch[2] === '학습' ? 'learning' : 'standard';
      return { teamKey, type, body: rest };
    }
  }

  // 팀명만 있는 경우 (질문)
  const teamKey = resolveTeamKey(firstToken);
  if (teamKey) {
    return { teamKey, type: 'question', body: rest };
  }

  // 팀명 없음 → CEO 오케스트레이터
  return { teamKey: null, type: 'question', body: cleaned };
}
