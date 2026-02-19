import Anthropic from '@anthropic-ai/sdk';
import { ENV } from '../config.js';
import type { ConversationMessage } from '../types.js';

const client = new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY });

/**
 * Claude API를 호출하여 응답을 생성한다.
 * @param systemPrompt  CLAUDE.md 내용 (시스템 프롬프트)
 * @param messages      대화 이력 + 현재 메시지
 */
export async function askClaude(
  systemPrompt: string,
  messages: ConversationMessage[],
): Promise<string> {
  const response = await client.messages.create({
    model: ENV.CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '(응답을 생성하지 못했습니다)';
}

/**
 * 학습/기준 등록 검토를 Claude에게 요청한다.
 * 5가지 항목을 분석하여 JSON 형태로 반환받는다.
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
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: reviewPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '(검토 결과를 생성하지 못했습니다)';
}
