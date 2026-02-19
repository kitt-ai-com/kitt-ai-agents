/** 팀 식별 정보 */
export interface TeamConfig {
  /** 팀 정식 이름 (한국어) */
  name: string;
  /** 폴더명 */
  folder: string;
  /** CLAUDE.md 상대 경로 (AGENTS_ROOT_PATH 기준) */
  claudeMdPath: string;
  /** 팀 이모지 */
  emoji: string;
}

/** 명령 유형 */
export type CommandType = 'question' | 'learning' | 'standard' | 'learning-list' | 'standard-list';

/** 파싱된 명령 */
export interface ParsedCommand {
  /** 팀 키 (null이면 CEO 오케스트레이터) */
  teamKey: string | null;
  /** 명령 유형 */
  type: CommandType;
  /** 본문 내용 */
  body: string;
}

/** 대화 이력 메시지 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 검토 결과 */
export interface ReviewResult {
  /** 유효성 */
  validity: string;
  /** 구체성 */
  specificity: string;
  /** 충돌 여부 */
  conflict: string;
  /** 범위 적합성 */
  scope: string;
  /** 개선 제안 */
  improvement: {
    original: string;
    improved: string;
    reason: string;
  } | null;
  /** 전체 요약 */
  summary: string;
}

/** 등록 대기 데이터 (버튼 액션에서 사용) */
export interface PendingRegistration {
  teamKey: string;
  type: 'learning' | 'standard';
  original: string;
  improved: string | null;
  userId: string;
  channelId: string;
  threadTs: string;
}
