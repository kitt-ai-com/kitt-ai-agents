import type { App } from '@slack/bolt';
import { TEAMS } from '../config.js';
import { appendToClaudeMd } from '../services/claudemd.service.js';
import { pendingRegistrations } from '../services/review.service.js';

/** 버튼 클릭 액션 핸들러를 등록한다 */
export function registerActionHandlers(app: App): void {
  // 원본 그대로 등록
  app.action('register_original', async ({ ack, body, client }) => {
    await ack();
    const actionId = (body as any).actions?.[0]?.value;
    const pending = pendingRegistrations.get(actionId);
    if (!pending) {
      await respondEphemeral(client, body, '등록 정보가 만료되었습니다. 다시 시도해주세요.');
      return;
    }

    try {
      appendToClaudeMd(pending.teamKey, pending.type, pending.original);
      const team = TEAMS[pending.teamKey];
      const typeLabel = pending.type === 'learning' ? '💡 학습' : '⛔ 기준';
      await respondInThread(client, pending.channelId, pending.threadTs,
        `✅ ${team.emoji} ${team.name}에 ${typeLabel} 등록 완료!\n> ${pending.original}`);
    } catch (err: any) {
      await respondInThread(client, pending.channelId, pending.threadTs,
        `❌ 등록 실패: ${err.message}`);
    } finally {
      pendingRegistrations.delete(actionId);
    }
  });

  // 개선안으로 등록
  app.action('register_improved', async ({ ack, body, client }) => {
    await ack();
    const actionId = (body as any).actions?.[0]?.value;
    const pending = pendingRegistrations.get(actionId);
    if (!pending || !pending.improved) {
      await respondEphemeral(client, body, '등록 정보가 만료되었거나 개선안이 없습니다.');
      return;
    }

    try {
      appendToClaudeMd(pending.teamKey, pending.type, pending.improved);
      const team = TEAMS[pending.teamKey];
      const typeLabel = pending.type === 'learning' ? '💡 학습' : '⛔ 기준';
      await respondInThread(client, pending.channelId, pending.threadTs,
        `✅ ${team.emoji} ${team.name}에 ${typeLabel} 등록 완료! (개선안)\n> ${pending.improved}`);
    } catch (err: any) {
      await respondInThread(client, pending.channelId, pending.threadTs,
        `❌ 등록 실패: ${err.message}`);
    } finally {
      pendingRegistrations.delete(actionId);
    }
  });

  // 직접 수정 후 등록 (모달 열기)
  app.action('register_custom', async ({ ack, body, client }) => {
    await ack();
    const actionId = (body as any).actions?.[0]?.value;
    const pending = pendingRegistrations.get(actionId);
    if (!pending) {
      await respondEphemeral(client, body, '등록 정보가 만료되었습니다. 다시 시도해주세요.');
      return;
    }

    const typeLabel = pending.type === 'learning' ? '💡 학습' : '⛔ 기준';

    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'custom_register_modal',
        private_metadata: actionId,
        title: { type: 'plain_text', text: `${typeLabel} 직접 수정` },
        submit: { type: 'plain_text', text: '등록' },
        close: { type: 'plain_text', text: '취소' },
        blocks: [
          {
            type: 'input',
            block_id: 'content_block',
            label: { type: 'plain_text', text: '등록할 내용을 수정해주세요' },
            element: {
              type: 'plain_text_input',
              action_id: 'content_input',
              multiline: true,
              initial_value: pending.improved || pending.original,
            },
          },
        ],
      },
    });
  });

  // 모달 제출 처리
  app.view('custom_register_modal', async ({ ack, view, client }) => {
    await ack();
    const actionId = view.private_metadata;
    const pending = pendingRegistrations.get(actionId);
    if (!pending) return;

    const customContent =
      view.state.values.content_block.content_input.value?.trim();
    if (!customContent) return;

    try {
      appendToClaudeMd(pending.teamKey, pending.type, customContent);
      const team = TEAMS[pending.teamKey];
      const typeLabel = pending.type === 'learning' ? '💡 학습' : '⛔ 기준';
      await respondInThread(client, pending.channelId, pending.threadTs,
        `✅ ${team.emoji} ${team.name}에 ${typeLabel} 등록 완료! (직접 수정)\n> ${customContent}`);
    } catch (err: any) {
      await respondInThread(client, pending.channelId, pending.threadTs,
        `❌ 등록 실패: ${err.message}`);
    } finally {
      pendingRegistrations.delete(actionId);
    }
  });

  // 취소
  app.action('register_cancel', async ({ ack, body, client }) => {
    await ack();
    const actionId = (body as any).actions?.[0]?.value;
    pendingRegistrations.delete(actionId);
    await respondEphemeral(client, body, '등록이 취소되었습니다.');
  });
}

/** 스레드에 메시지 전송 */
async function respondInThread(
  client: any,
  channelId: string,
  threadTs: string,
  text: string,
): Promise<void> {
  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}

/** 에피머럴(본인만 보이는) 메시지 전송 */
async function respondEphemeral(client: any, body: any, text: string): Promise<void> {
  await client.chat.postEphemeral({
    channel: body.channel?.id || body.container?.channel_id,
    user: body.user?.id || body.user,
    text,
  });
}
