import { App } from '@slack/bolt';
import { ENV } from './config.js';
import { initDatabase } from './services/history.service.js';
import { registerMentionHandler } from './handlers/mention.handler.js';
import { registerActionHandlers } from './handlers/action.handler.js';

/** Slack Bolt 앱 초기화 (Socket Mode) */
const app = new App({
  token: ENV.SLACK_BOT_TOKEN,
  appToken: ENV.SLACK_APP_TOKEN,
  signingSecret: ENV.SLACK_SIGNING_SECRET,
  socketMode: true,
});

/** 앱 시작 */
async function main(): Promise<void> {
  // SQLite 초기화
  initDatabase();
  console.log('✅ 데이터베이스 초기화 완료');

  // 핸들러 등록
  registerMentionHandler(app);
  registerActionHandlers(app);
  console.log('✅ 이벤트 핸들러 등록 완료');

  // 앱 시작
  await app.start();
  console.log('⚡ 슬랙봇이 실행되었습니다! (Socket Mode)');
  console.log('─'.repeat(40));
  console.log('사용법: @봇이름 [팀명] [질문]');
  console.log('  예) @봇 마케팅 메타 광고 캠페인 기획해줘');
  console.log('  예) @봇 mk 광고 기획해줘 (짧은 별칭)');
  console.log('  예) @봇 마케팅-학습 CTR 높은 방법');
  console.log('  예) @봇 마케팅-학습목록');
}

main().catch((err) => {
  console.error('❌ 앱 시작 실패:', err);
  process.exit(1);
});
