import type { App } from '@slack/bolt';
import { TEAMS } from '../config.js';
import { parseCommand } from '../utils/parser.js';
import { readClaudeMd, listFromClaudeMd } from '../services/claudemd.service.js';
import { askClaude } from '../services/claude.service.js';
import { saveMessage, getHistory, getThreadTeam } from '../services/history.service.js';
import { buildReviewMessage } from '../services/review.service.js';

/** 앱 멘션 이벤트 핸들러를 등록한다 */
export function registerMentionHandler(app: App): void {
  app.event('app_mention', async ({ event, say }) => {
    const { text, user, channel, thread_ts, ts } = event;
    const threadTs = thread_ts || ts; // 스레드가 없으면 현재 메시지를 스레드 루트로

    try {
      // 명령어 파싱
      let parsed = parseCommand(text);

      // 스레드 내 대화이면 이전 팀 컨텍스트 유지
      if (!parsed.teamKey && thread_ts) {
        const prevTeam = getThreadTeam(channel, thread_ts);
        if (prevTeam) {
          parsed = { ...parsed, teamKey: prevTeam };
        }
      }

      const team = parsed.teamKey ? TEAMS[parsed.teamKey] : null;
      const teamLabel = team ? `${team.emoji} ${team.name}` : '🏢 CEO';

      // ─── 목록 조회 ───
      if (parsed.type === 'learning-list' || parsed.type === 'standard-list') {
        const listType = parsed.type === 'learning-list' ? 'learning' : 'standard';
        const typeLabel = listType === 'learning' ? '💡 학습' : '⛔ 기준';

        if (!parsed.teamKey) {
          await say({ text: '팀명을 지정해주세요. 예: `@봇 마케팅-학습목록`', thread_ts: threadTs });
          return;
        }

        const items = listFromClaudeMd(parsed.teamKey, listType);

        if (items.length === 0) {
          await say({
            text: `${teamLabel} - 등록된 ${typeLabel}이 없습니다.`,
            thread_ts: threadTs,
          });
        } else {
          const listText = items.map((item, i) => `${i + 1}. ${item}`).join('\n');
          await say({
            text: `${teamLabel} - ${typeLabel} 목록 (${items.length}건)\n\n${listText}`,
            thread_ts: threadTs,
          });
        }
        return;
      }

      // ─── 학습/기준 등록 ───
      if (parsed.type === 'learning' || parsed.type === 'standard') {
        if (!parsed.teamKey) {
          await say({ text: '팀명을 지정해주세요. 예: `@봇 마케팅-학습 [내용]`', thread_ts: threadTs });
          return;
        }

        if (!parsed.body.trim()) {
          const typeLabel = parsed.type === 'learning' ? '학습' : '기준';
          await say({ text: `등록할 ${typeLabel} 내용을 입력해주세요.`, thread_ts: threadTs });
          return;
        }

        // 로딩 표시
        await say({ text: `${teamLabel} ${parsed.type === 'learning' ? '💡 학습' : '⛔ 기준'} 등록 검토 중...`, thread_ts: threadTs });

        // 검토 플로우
        const reviewMsg = await buildReviewMessage(
          parsed.teamKey,
          parsed.type,
          parsed.body,
          user!,
          channel,
          threadTs,
        );

        await say({ ...reviewMsg, thread_ts: threadTs });
        return;
      }

      // ─── 질문 처리 ───
      if (!parsed.body.trim()) {
        const helpText = team
          ? `${teamLabel}에게 질문하려면 내용을 입력해주세요.\n예: \`@봇 ${parsed.teamKey} 광고 캠페인 기획해줘\``
          : '무엇을 도와드릴까요? 팀명과 함께 질문해주세요.\n예: `@봇 마케팅 광고 캠페인 기획해줘`';
        await say({ text: helpText, thread_ts: threadTs });
        return;
      }

      // CLAUDE.md를 시스템 프롬프트로 로드
      const systemPrompt = readClaudeMd(parsed.teamKey);

      // 대화 이력 가져오기
      const history = thread_ts ? getHistory(channel, thread_ts) : [];

      // 유저 메시지 저장
      saveMessage(channel, threadTs, parsed.teamKey, 'user', parsed.body);

      // 로딩 표시
      await say({ text: `${teamLabel} 응답 생성 중... :hourglass_flowing_sand:`, thread_ts: threadTs });

      // Claude API 호출
      const messages = [...history, { role: 'user' as const, content: parsed.body }];
      const response = await askClaude(systemPrompt, messages);

      // 어시스턴트 응답 저장
      saveMessage(channel, threadTs, parsed.teamKey, 'assistant', response);

      // 응답 전송
      await say({ text: `${teamLabel}\n\n${response}`, thread_ts: threadTs });

    } catch (err: any) {
      console.error('멘션 처리 오류:', err);
      await say({
        text: `❌ 오류가 발생했습니다: ${err.message}`,
        thread_ts: threadTs,
      });
    }
  });
}
