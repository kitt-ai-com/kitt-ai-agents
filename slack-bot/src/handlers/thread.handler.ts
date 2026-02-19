import type { App } from '@slack/bolt';
import { TEAMS } from '../config.js';
import { readClaudeMd } from '../services/claudemd.service.js';
import { askClaudeStream, truncateForSlack, splitForSlack, FILE_PROCESSING_PREFIX } from '../services/claude.service.js';
import { saveMessage, getHistory, getThreadTeam } from '../services/history.service.js';
import { resolveTeamByChannelId } from '../services/channel.service.js';
import {
  extractSupportedFiles, validateFile, downloadSlackFile,
  parseExcelBuffer, excelDataToMarkdown, extractHtmlFromResponse,
  isHtmlResponse,
} from '../services/file.service.js';
import { uploadHtmlToGDrive } from '../services/gdrive.service.js';

/** 스트리밍 업데이트 간격 (ms) */
const UPDATE_INTERVAL = 1500;

/**
 * 스레드 내 자동 응답 핸들러
 *
 * 봇이 이미 참여한 스레드에서는 @멘션 없이도 자동으로 응답한다.
 */
export function registerThreadHandler(app: App, botUserId: string): void {
  app.event('message', async ({ event, say, client }) => {
    const msg = event as any;
    if (msg.bot_id) return;
    if (msg.subtype && msg.subtype !== 'file_share') return;
    if (!msg.thread_ts) return;

    const text: string = msg.text || '';
    if (text.includes(`<@${botUserId}>`)) return;

    const { channel, thread_ts } = msg;

    const prevTeam = getThreadTeam(channel, thread_ts);
    if (prevTeam === null && getHistory(channel, thread_ts).length === 0) {
      return;
    }

    try {
      let teamKey = prevTeam;
      if (!teamKey) {
        teamKey = await resolveTeamByChannelId(channel);
      }
      const team = teamKey ? TEAMS[teamKey] : null;
      const teamLabel = team ? `${team.emoji} ${team.name}` : '🏢 CEO';

      const userMessage = text.trim();

      // ─── 파일 처리 ───
      const supportedFiles = extractSupportedFiles(msg.files);
      if (supportedFiles.length > 0) {
        const file = supportedFiles[0];
        const validationError = validateFile(file);
        if (validationError) {
          await say({ text: validationError, thread_ts });
          return;
        }

        const fileLoadingResult = await say({
          text: `${teamLabel} 파일 처리 중... :hourglass_flowing_sand: (${file.name})`,
          thread_ts,
        });
        const fileMsgTs = (fileLoadingResult as any).ts as string | undefined;

        const buffer = await downloadSlackFile(file.url_private);
        const parsedData = parseExcelBuffer(buffer, file.name);
        const markdownData = excelDataToMarkdown(parsedData);

        const instruction = userMessage || '이 데이터를 분석해주세요';
        const combinedPrompt = `## 사용자 지시사항\n${instruction}\n\n## 첨부된 데이터\n${markdownData}`;

        const systemPrompt = readClaudeMd(teamKey);
        const history = getHistory(channel, thread_ts);
        saveMessage(channel, thread_ts, teamKey, 'user', `[파일: ${file.name}] ${instruction}`);

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

        saveMessage(channel, thread_ts, teamKey, 'assistant', `[파일 처리 완료: ${file.name}]`);

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
            await say({ text: driveMsg, thread_ts });
          }
        } else {
          const fullText = `${teamLabel}\n\n${response}`;
          const chunks = splitForSlack(fullText);

          if (fileMsgTs) {
            await client.chat.update({ channel, ts: fileMsgTs, text: chunks[0] });
          } else {
            await say({ text: chunks[0], thread_ts });
          }
          for (let i = 1; i < chunks.length; i++) {
            await say({ text: chunks[i], thread_ts });
          }
        }
        return;
      }

      if (!userMessage) return;

      const systemPrompt = readClaudeMd(teamKey);
      const history = getHistory(channel, thread_ts);

      saveMessage(channel, thread_ts, teamKey, 'user', userMessage);

      // 로딩 메시지 → 스트리밍으로 실시간 업데이트
      const loadingResult = await say({ text: `${teamLabel} 응답 생성 중... :hourglass_flowing_sand:`, thread_ts });
      const msgTs = (loadingResult as any).ts as string | undefined;

      let lastUpdate = 0;
      const messages = [...history, { role: 'user' as const, content: userMessage }];

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

      saveMessage(channel, thread_ts, teamKey, 'assistant', response);

      // 최종 업데이트 (긴 응답은 여러 메시지로 분할)
      const fullText = `${teamLabel}\n\n${response}`;
      const chunks = splitForSlack(fullText);

      if (msgTs) {
        await client.chat.update({ channel, ts: msgTs, text: chunks[0] });
      } else {
        await say({ text: chunks[0], thread_ts });
      }
      for (let i = 1; i < chunks.length; i++) {
        await say({ text: chunks[i], thread_ts });
      }
    } catch (err: any) {
      console.error('스레드 자동 응답 오류:', err);
      await say({
        text: `❌ 오류가 발생했습니다: ${err.message}`,
        thread_ts,
      });
    }
  });
}
