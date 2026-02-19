import fs from 'node:fs';
import path from 'node:path';
import { ENV, TEAMS, CEO_CLAUDE_MD_PATH } from '../config.js';

/** AGENTS_ROOT_PATH의 절대 경로를 반환 */
function rootDir(): string {
  return path.resolve(__dirname, '..', '..', ENV.AGENTS_ROOT_PATH);
}

/** 팀 CLAUDE.md의 절대 경로 */
function teamMdPath(teamKey: string): string {
  const team = TEAMS[teamKey];
  if (!team) throw new Error(`알 수 없는 팀: ${teamKey}`);
  return path.join(rootDir(), team.claudeMdPath);
}

/** CEO CLAUDE.md의 절대 경로 */
function ceoMdPath(): string {
  return path.join(rootDir(), CEO_CLAUDE_MD_PATH);
}

/**
 * CLAUDE.md 파일 내용을 읽어 반환한다.
 * @param teamKey null이면 CEO(루트) CLAUDE.md를 읽는다.
 */
export function readClaudeMd(teamKey: string | null): string {
  const filePath = teamKey ? teamMdPath(teamKey) : ceoMdPath();
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`CLAUDE.md 파일을 읽을 수 없습니다: ${filePath}`);
  }
}

/**
 * 학습 또는 기준 항목을 CLAUDE.md에 추가한다.
 *
 * 방식:
 *   1. "## 💡 학습" 또는 "## ⛔ 기준" 섹션을 찾는다.
 *   2. "(아직 등록된 ... 없음)" 이 있으면 해당 줄을 새 항목으로 교체한다.
 *   3. 기존 항목이 있으면 해당 섹션의 마지막 항목 뒤에 추가한다.
 *   4. 섹션 자체가 없으면 파일 끝에 섹션을 만들고 항목을 추가한다.
 */
export function appendToClaudeMd(
  teamKey: string,
  type: 'learning' | 'standard',
  content: string,
): void {
  const filePath = teamMdPath(teamKey);
  const original = fs.readFileSync(filePath, 'utf-8');

  // 백업 생성
  fs.writeFileSync(filePath + '.bak', original, 'utf-8');

  const sectionHeader = type === 'learning' ? '## 💡 학습' : '## ⛔ 기준';
  const emptyPattern =
    type === 'learning'
      ? /\(아직 등록된 학습이? 없음\.?\)/
      : /\(아직 등록된 기준이? 없음\.?\)/;
  const newItem = `- ${content}`;

  let result: string;

  const headerIdx = original.indexOf(sectionHeader);

  if (headerIdx === -1) {
    // 섹션이 없으면 파일 끝에 추가
    result = original.trimEnd() + `\n\n${sectionHeader}\n${newItem}\n`;
  } else if (emptyPattern.test(original)) {
    // "아직 등록된 ... 없음" 줄을 교체
    result = original.replace(emptyPattern, newItem);
  } else {
    // 기존 항목 뒤에 추가: 섹션 시작부터 다음 ##이나 파일 끝까지의 범위에서 마지막 "- " 항목 뒤에 삽입
    const afterHeader = original.substring(headerIdx);
    const nextSectionMatch = afterHeader.substring(sectionHeader.length).search(/\n## /);
    const sectionEnd =
      nextSectionMatch === -1
        ? original.length
        : headerIdx + sectionHeader.length + nextSectionMatch;

    const sectionContent = original.substring(headerIdx, sectionEnd);
    const lastItemIdx = sectionContent.lastIndexOf('\n- ');

    if (lastItemIdx === -1) {
      // 섹션에 항목이 없으면 헤더 바로 다음에 추가
      const insertPos = headerIdx + sectionHeader.length;
      const lineEnd = original.indexOf('\n', insertPos);
      const pos = lineEnd === -1 ? original.length : lineEnd;
      result = original.substring(0, pos) + '\n' + newItem + original.substring(pos);
    } else {
      // 마지막 항목의 줄 끝을 찾아 그 뒤에 삽입
      const absoluteLastItemIdx = headerIdx + lastItemIdx;
      const lineEnd = original.indexOf('\n', absoluteLastItemIdx + 1);
      const pos = lineEnd === -1 ? original.length : lineEnd;
      result = original.substring(0, pos) + '\n' + newItem + original.substring(pos);
    }
  }

  fs.writeFileSync(filePath, result, 'utf-8');
}

/**
 * CLAUDE.md에서 학습 또는 기준 목록을 추출한다.
 */
export function listFromClaudeMd(
  teamKey: string,
  type: 'learning' | 'standard',
): string[] {
  const content = readClaudeMd(teamKey);
  const sectionHeader = type === 'learning' ? '## 💡 학습' : '## ⛔ 기준';

  const headerIdx = content.indexOf(sectionHeader);
  if (headerIdx === -1) return [];

  const afterHeader = content.substring(headerIdx + sectionHeader.length);
  const nextSectionMatch = afterHeader.search(/\n## /);
  const sectionText =
    nextSectionMatch === -1 ? afterHeader : afterHeader.substring(0, nextSectionMatch);

  const items: string[] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const itemText = trimmed.substring(2).trim();
      // "아직 등록된 ... 없음" 은 제외
      if (!itemText.match(/^[\(（]아직 등록된/)) {
        items.push(itemText);
      }
    }
  }

  return items;
}
