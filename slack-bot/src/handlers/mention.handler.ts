import type { App } from '@slack/bolt';
import { TEAMS, resolveTeamKey } from '../config.js';
import { parseCommand } from '../utils/parser.js';
import { readClaudeMd, listFromClaudeMd } from '../services/claudemd.service.js';
import { askClaudeStream, truncateForSlack, splitForSlack, SLACK_MAX_LENGTH, FILE_PROCESSING_PREFIX } from '../services/claude.service.js';
import { saveMessage, getHistory, getThreadTeam, setChannelTeam, getChannelTeamSetting, clearChannelTeam } from '../services/history.service.js';
import { buildReviewMessage } from '../services/review.service.js';
import { resolveTeamByChannelId } from '../services/channel.service.js';
import {
  extractSupportedFiles, validateFile, downloadSlackFile,
  parseExcelBuffer, excelDataToMarkdown, extractHtmlFromResponse,
  isHtmlResponse,
} from '../services/file.service.js';
import { uploadHtmlToGDrive } from '../services/gdrive.service.js';

/** 스트리밍 업데이트 간격 (ms) */
const UPDATE_INTERVAL = 1500;

/** 앱 멘션 이벤트 핸들러를 등록한다 */
export function registerMentionHandler(app: App): void {
  app.event('app_mention', async ({ event, say, client }) => {
    const { text, user, channel, thread_ts, ts } = event;
    const threadTs = thread_ts || ts;

    try {
      const cleaned = text.replace(/<@[A-Z0-9]+>/g, '').trim();

      // ─── 설정 명령어 처리 ───
      if (cleaned.startsWith('설정')) {
        const settingArg = cleaned.replace(/^설정\s*/, '').trim();

        if (settingArg === '해제') {
          clearChannelTeam(channel);
          await say({ text: '✅ 이 채널의 팀 설정이 해제되었습니다.', thread_ts: threadTs });
          return;
        }

        if (settingArg) {
          const teamKey = resolveTeamKey(settingArg);
          if (teamKey) {
            setChannelTeam(channel, teamKey);
            const team = TEAMS[teamKey];
            await say({
              text: `✅ 이 채널이 ${team.emoji} ${team.name}으로 설정되었습니다.\n이제 팀명 없이 바로 질문할 수 있습니다.`,
              thread_ts: threadTs,
            });
          } else {
            await say({ text: `❌ 알 수 없는 팀입니다: ${settingArg}`, thread_ts: threadTs });
          }
          return;
        }

        // 설정만 입력 → 현재 설정 표시
        const currentTeam = getChannelTeamSetting(channel);
        if (currentTeam) {
          const team = TEAMS[currentTeam];
          await say({ text: `현재 채널 설정: ${team.emoji} ${team.name}\n해제: \`@봇 설정 해제\``, thread_ts: threadTs });
        } else {
          await say({ text: '이 채널에 설정된 팀이 없습니다.\n예: `@봇 설정 마케팅`', thread_ts: threadTs });
        }
        return;
      }

      // 명령어 파싱
      let parsed = parseCommand(text);

      // 스레드 내 대화이면 이전 팀 컨텍스트 유지
      if (!parsed.teamKey && thread_ts) {
        const prevTeam = getThreadTeam(channel, thread_ts);
        if (prevTeam) {
          parsed = { ...parsed, teamKey: prevTeam };
        }
      }

      // 팀이 아직 미지정이면 채널 이름으로 자동 추론
      if (!parsed.teamKey) {
        const channelTeam = await resolveTeamByChannelId(channel);
        if (channelTeam) {
          const body = parsed.body || text.replace(/<@[A-Z0-9]+>/g, '').trim();
          parsed = { ...parsed, teamKey: channelTeam, body };
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

        await say({ text: `${teamLabel} ${parsed.type === 'learning' ? '💡 학습' : '⛔ 기준'} 등록 검토 중...`, thread_ts: threadTs });

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

      // ─── 파일 처리 ───
      const supportedFiles = extractSupportedFiles((event as any).files);
      if (supportedFiles.length > 0) {
        const file = supportedFiles[0];
        const validationError = validateFile(file);
        if (validationError) {
          await say({ text: validationError, thread_ts: threadTs });
          return;
        }

        const loadingResult = await say({
          text: `${teamLabel} 파일 처리 중... :hourglass_flowing_sand: (${file.name})`,
          thread_ts: threadTs,
        });
        const fileMsgTs = (loadingResult as any).ts as string | undefined;

        const buffer = await downloadSlackFile(file.url_private);
        const parsedData = parseExcelBuffer(buffer, file.name);
        const markdownData = excelDataToMarkdown(parsedData);

        const instruction = parsed.body.trim() || '이 데이터를 분석해주세요';
        const combinedPrompt = `## 사용자 지시사항\n${instruction}\n\n## 첨부된 데이터\n${markdownData}`;

        const systemPrompt = readClaudeMd(parsed.teamKey);
        const history = thread_ts ? getHistory(channel, thread_ts) : [];
        saveMessage(channel, threadTs, parsed.teamKey, 'user', `[파일: ${file.name}] ${instruction}`);

        let lastFileUpdate = 0;
        const response = await askClaudeStream(
          systemPrompt,
          [...history, { role: 'user' as const, content: combinedPrompt }],
          (accumulated) => {
            const now = Date.now();
            if (fileMsgTs && now - lastFileUpdate > UPDATE_INTERVAL) {
              lastFileUpdate = now;
              client.chat.update({
                channel,
                ts: fileMsgTs,
                text: `${teamLabel} 파일 처리 중... (${accumulated.length}자 생성)`,
              }).catch(() => {});
            }
          },
          { maxTokens: 8192, systemPrefix: FILE_PROCESSING_PREFIX },
        );

        saveMessage(channel, threadTs, parsed.teamKey, 'assistant', `[파일 처리 완료: ${file.name}]`);

        if (isHtmlResponse(response)) {
          const htmlContent = extractHtmlFromResponse(response);
          const outputFileName = file.name.replace(/\.(xlsx|xls|csv)$/i, '') + '_report.html';

          if (fileMsgTs) {
            await client.chat.update({ channel, ts: fileMsgTs, text: `${teamLabel} Google Drive에 업로드 중...` });
          }
          const { webViewLink } = await uploadHtmlToGDrive(htmlContent, outputFileName);
          const driveMsg = `${teamLabel} HTML 보고서가 준비되었습니다!\n📊 <${webViewLink}|${outputFileName}>\n\n링크를 클릭하면 브라우저에서 바로 확인할 수 있습니다.`;
          if (fileMsgTs) {
            await client.chat.update({ channel, ts: fileMsgTs, text: driveMsg });
          } else {
            await say({ text: driveMsg, thread_ts: threadTs });
          }
        } else {
          // 일반 텍스트 응답은 기존 방식으로 전달
          const fullText = `${teamLabel}\n\n${response}`;
          const chunks = splitForSlack(fullText);

          if (fileMsgTs) {
            await client.chat.update({ channel, ts: fileMsgTs, text: chunks[0] });
          } else {
            await say({ text: chunks[0], thread_ts: threadTs });
          }
          for (let i = 1; i < chunks.length; i++) {
            await say({ text: chunks[i], thread_ts: threadTs });
          }
        }
        return;
      }

      // ─── 질문 처리 (스트리밍) ───
      if (!parsed.body.trim()) {
        const helpText = team
          ? `${teamLabel}에게 질문하려면 내용을 입력해주세요.\n예: \`@봇 ${parsed.teamKey} 광고 캠페인 기획해줘\``
          : '무엇을 도와드릴까요? 팀명과 함께 질문해주세요.\n예: `@봇 마케팅 광고 캠페인 기획해줘`';
        await say({ text: helpText, thread_ts: threadTs });
        return;
      }

      const systemPrompt = readClaudeMd(parsed.teamKey);
      const history = thread_ts ? getHistory(channel, thread_ts) : [];

      saveMessage(channel, threadTs, parsed.teamKey, 'user', parsed.body);

      // 로딩 메시지 → 스트리밍으로 실시간 업데이트
      const loadingResult = await say({ text: `${teamLabel} 응답 생성 중... :hourglass_flowing_sand:`, thread_ts: threadTs });
      const msgTs = (loadingResult as any).ts as string | undefined;

      let lastUpdate = 0;
      const messages = [...history, { role: 'user' as const, content: parsed.body }];

      const response = await askClaudeStream(systemPrompt, messages, (accumulated) => {
        const now = Date.now();
        if (msgTs && now - lastUpdate > UPDATE_INTERVAL) {
          lastUpdate = now;
          const preview = truncateForSlack(accumulated);
          client.chat.update({
            channel,
            ts: msgTs,
            text: `${teamLabel}\n\n${preview}`,
          }).catch(() => {});
        }
      });

      saveMessage(channel, threadTs, parsed.teamKey, 'assistant', response);

      // 최종 업데이트 (긴 응답은 여러 메시지로 분할)
      const fullText = `${teamLabel}\n\n${response}`;
      const chunks = splitForSlack(fullText);

      if (msgTs) {
        await client.chat.update({ channel, ts: msgTs, text: chunks[0] });
      } else {
        await say({ text: chunks[0], thread_ts: threadTs });
      }
      for (let i = 1; i < chunks.length; i++) {
        await say({ text: chunks[i], thread_ts: threadTs });
      }

    } catch (err: any) {
      console.error('멘션 처리 오류:', err);
      await say({
        text: `❌ 오류가 발생했습니다: ${err.message}`,
        thread_ts: threadTs,
      });
    }
  });
}
