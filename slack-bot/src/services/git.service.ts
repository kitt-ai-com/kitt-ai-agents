import { execFile } from 'node:child_process';
import path from 'node:path';
import { ENV } from '../config.js';

/** 프로젝트 루트(git repo) 절대 경로 */
function repoRoot(): string {
  return path.resolve(__dirname, '..', '..', ENV.AGENTS_ROOT_PATH);
}

/** shell 명령 실행을 Promise로 래핑 */
function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args[0]} 실패: ${stderr || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * CLAUDE.md 변경 사항을 자동으로 git commit & push 한다.
 *
 * @param teamName   팀 표시 이름 (예: "마케팅팀")
 * @param type       learning | standard
 * @param content    등록된 내용
 * @param slackUser  등록한 슬랙 유저 ID
 */
export async function autoCommitAndPush(
  teamName: string,
  type: 'learning' | 'standard',
  content: string,
  slackUser: string,
): Promise<void> {
  const cwd = repoRoot();
  const typeLabel = type === 'learning' ? '학습' : '기준';

  try {
    // 변경된 CLAUDE.md 파일들만 스테이징
    await run('git', ['add', '*.md'], cwd);

    // 커밋 메시지 작성
    const message = `[${teamName}] ${typeLabel} 등록: ${content}\n\nSlack user: ${slackUser}`;
    await run('git', ['commit', '-m', message], cwd);

    // 푸시
    await run('git', ['push'], cwd);

    console.log(`[git] 자동 커밋 완료: ${teamName} ${typeLabel}`);
  } catch (err: any) {
    // git 실패해도 학습 등록 자체는 성공했으므로 에러를 throw하지 않고 로그만 남김
    console.error(`[git] 자동 커밋 실패 (등록은 완료됨):`, err.message);
  }
}
