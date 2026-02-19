import Anthropic from '@anthropic-ai/sdk';
import { ENV } from '../config.js';
import type { ConversationMessage } from '../types.js';

const client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });

/** 슬랙 응답 간결성 유도 */
const SLACK_PREFIX = `[응답 규칙] 슬랙 메시지로 응답합니다. 핵심만 간결하게, 불필요한 서론·인사말·반복 없이 실용적 내용 위주로 작성하세요. 응답은 3000자 이내로 제한하세요.\n\n`;

/** 파일 처리용 시스템 프리픽스 */
export const FILE_PROCESSING_PREFIX = `[필수 응답 규칙]
당신은 데이터 처리 엔진입니다. 사용자의 지시사항에 따라 결과물만 출력하세요.

## HTML 보고서 요청 시 (사용자가 "HTML", "보고서", "리포트" 등을 언급한 경우):
- 반드시 <!DOCTYPE html>로 시작하는 완전한 HTML 문서를 바로 출력하세요
- "보고서를 만들겠습니다", "잠시만 기다려주세요", "분석해보겠습니다" 같은 안내 문구를 절대 쓰지 마세요
- 설명 텍스트 없이 HTML 코드만 출력하세요. 마크다운 코드 블록(\`\`\`)으로 감싸지 마세요
- 인라인 CSS로 깔끔한 테이블, 차트, 레이아웃을 만드세요
- 외부 CDN을 참조하지 마세요
- 한국어로 작성하세요

## 분석/요약 요청 시 (HTML 언급 없는 경우):
- 일반 텍스트로 핵심만 간결하게 응답하세요
- 3000자 이내로 제한하세요\n\n`;

/** API 전송 시 최대 이력 수 */
const MAX_HISTORY = 10;

/** Slack 메시지 최대 길이 (안전 마진 포함) */
export const SLACK_MAX_LENGTH = 3500;

/** 스트리밍 미리보기용 자르기 */
export function truncateForSlack(text: string): string {
  if (text.length <= SLACK_MAX_LENGTH) return text;
  return text.substring(0, SLACK_MAX_LENGTH) + '...';
}

/** 긴 메시지를 여러 청크로 분할 */
export function splitForSlack(text: string): string[] {
  if (text.length <= SLACK_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= SLACK_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // 줄바꿈 기준으로 자연스럽게 분할
    let cutAt = remaining.lastIndexOf('\n', SLACK_MAX_LENGTH);
    if (cutAt < SLACK_MAX_LENGTH * 0.5) {
      // 줄바꿈이 너무 앞에 있으면 공백 기준
      cutAt = remaining.lastIndexOf(' ', SLACK_MAX_LENGTH);
    }
    if (cutAt < SLACK_MAX_LENGTH * 0.5) {
      cutAt = SLACK_MAX_LENGTH;
    }

    chunks.push(remaining.substring(0, cutAt));
    remaining = remaining.substring(cutAt).trimStart();
  }

  return chunks;
}

/**
 * Claude API를 스트리밍으로 호출한다.
 * @param systemPrompt  CLAUDE.md 내용 (시스템 프롬프트)
 * @param messages      대화 이력 + 현재 메시지
 * @param onText        텍스트 누적 시 콜백 (실시간 업데이트용)
 */
export async function askClaudeStream(
  systemPrompt: string,
  messages: ConversationMessage[],
  onText?: (accumulated: string) => void,
  options?: { maxTokens?: number; systemPrefix?: string },
): Promise<string> {
  const trimmed = messages.slice(-MAX_HISTORY);
  const maxTokens = options?.maxTokens ?? 1500;
  const prefix = options?.systemPrefix ?? SLACK_PREFIX;

  const stream = client.messages.stream({
    model: ENV.CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: prefix + systemPrompt,
    messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
  });

  let accumulated = '';
  stream.on('text', (text) => {
    accumulated += text;
    if (onText) onText(accumulated);
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '(응답을 생성하지 못했습니다)';
}

/**
 * Claude API를 호출하여 응답을 생성한다 (비스트리밍).
 */
export async function askClaude(
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<string> {
  const trimmed = messages.slice(-MAX_HISTORY);

  const response = await client.messages.create({
    model: ENV.CLAUDE_MODEL,
    max_tokens: 1500,
    system: SLACK_PREFIX + systemPrompt,
    messages: trimmed.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '(응답을 생성하지 못했습니다)';
}

/**
 * 학습/기준 등록 검토를 Claude에게 요청한다.
 */
export async function reviewWithClaude(
  systemPrompt: string,
  type: 'learning' | 'standard',
  content: string,
): Promise<string> {
  const typeLabel = type === 'learning' ? '💡 학습' : '⛔ 기준';
  const strictNote =
    type === 'standard'
      ? '\n- 기준은 모든 결과물에 강제 적용되므로 더욱 엄격하게 검토하세요.\n- "이 기준이 다른 업무를 과도하게 제한하지 않는지"도 반드시 검토하세요.'
      : '';

  const reviewPrompt = `다음은 ${typeLabel} 등록 요청입니다. 아래 5가지 항목을 검토해주세요.${strictNote}

등록 요청 내용: "${content}"

검토 항목:
1. 유효성: 내용이 사실에 부합하는지
2. 구체성: 너무 모호하지 않은지, 실행 가능한 수준인지
3. 충돌 여부: 기존 등록된 학습/기준과 모순되지 않는지
4. 범위: 해당 팀에 맞는 내용인지
5. 개선 가능성: 더 정확하거나 유용하게 다듬을 수 있는지

다음 형식으로 응답해주세요:

📋 [${typeLabel}] 등록 검토 결과

✅ 유효성: [판단 결과]
📏 구체성: [판단 결과]
🔄 기존 내용과 충돌: [있음/없음 + 상세]
📂 범위 적합성: [판단 결과]

💡 개선 제안: (있는 경우)
   - 원본: ${content}
   - 개선안: [더 나은 버전]
   - 이유: [왜 개선안이 나은지]

개선안이 없으면 "개선 제안 없음 - 원본이 충분히 명확합니다."라고 작성해주세요.`;

  const response = await client.messages.create({
    model: ENV.CLAUDE_MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: reviewPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '(검토 결과를 생성하지 못했습니다)';
}
