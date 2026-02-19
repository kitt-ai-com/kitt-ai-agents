import * as XLSX from 'xlsx';
import { ENV } from '../config.js';

/** 지원하는 파일 확장자 */
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/** 최대 파일 크기 (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Claude에게 전송할 최대 행 수 */
const MAX_ROWS = 500;

/** Slack 파일 객체 (필요한 필드만) */
export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private: string;
}

/** 파싱된 엑셀 시트 데이터 */
interface ParsedSheet {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

/** 파싱된 엑셀 파일 데이터 */
export interface ParsedExcelData {
  fileName: string;
  sheets: ParsedSheet[];
}

/**
 * event.files 배열에서 지원하는 엑셀/CSV 파일만 추출한다.
 */
export function extractSupportedFiles(files: any[] | undefined): SlackFile[] {
  if (!files || !Array.isArray(files)) return [];
  return files.filter((f) => {
    const ext = '.' + (f.name || '').split('.').pop()?.toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });
}

/**
 * 파일 유효성 검사. 문제가 있으면 에러 메시지 반환, 없으면 null.
 */
export function validateFile(file: SlackFile): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return `❌ 지원하지 않는 파일 형식입니다: ${ext}\n지원 형식: ${SUPPORTED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `❌ 파일 크기가 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB).\n최대 ${MAX_FILE_SIZE / 1024 / 1024}MB까지 지원합니다.`;
  }
  return null;
}

/**
 * Slack에서 파일을 다운로드한다. (Bearer 토큰 인증)
 */
export async function downloadSlackFile(urlPrivate: string): Promise<Buffer> {
  const response = await fetch(urlPrivate, {
    headers: { Authorization: `Bearer ${ENV.SLACK_BOT_TOKEN}` },
  });
  if (!response.ok) {
    throw new Error(`파일 다운로드 실패 (HTTP ${response.status}). files:read 권한을 확인해주세요.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * 엑셀/CSV 버퍼를 파싱한다.
 */
export function parseExcelBuffer(buffer: Buffer, fileName: string): ParsedExcelData {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return { name: sheetName, headers: [], rows: [], totalRows: 0, truncated: false };
    }

    const headers = rawData[0].map((h: any) => String(h ?? ''));
    const allRows = rawData.slice(1).map((row) =>
      row.map((cell: any) => String(cell ?? '')),
    );
    const totalRows = allRows.length;
    const truncated = totalRows > MAX_ROWS;
    const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;

    return { name: sheetName, headers, rows, totalRows, truncated };
  });

  return { fileName, sheets };
}

/**
 * 파싱된 엑셀 데이터를 마크다운 테이블 문자열로 변환한다.
 */
export function excelDataToMarkdown(data: ParsedExcelData): string {
  const parts: string[] = [`**파일명**: ${data.fileName}\n`];

  for (const sheet of data.sheets) {
    parts.push(`### 시트: ${sheet.name} (${sheet.totalRows}행)`);

    if (sheet.headers.length === 0) {
      parts.push('(데이터 없음)\n');
      continue;
    }

    parts.push('| ' + sheet.headers.join(' | ') + ' |');
    parts.push('| ' + sheet.headers.map(() => '---').join(' | ') + ' |');

    for (const row of sheet.rows) {
      const paddedRow = sheet.headers.map((_, i) => row[i] || '');
      parts.push('| ' + paddedRow.join(' | ') + ' |');
    }

    if (sheet.truncated) {
      parts.push(
        `\n> (... ${sheet.totalRows - MAX_ROWS}개 행 생략, 총 ${sheet.totalRows}행 중 상위 ${MAX_ROWS}행만 표시)`,
      );
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Claude 응답에서 HTML을 추출한다.
 * 마크다운 코드블록으로 감싸진 경우 처리.
 */
export function extractHtmlFromResponse(response: string): string {
  const codeBlockMatch = response.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.toLowerCase().startsWith('<html')) {
    return trimmed;
  }

  // HTML이 아닌 경우 기본 래퍼
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Report</title>
<style>body{font-family:sans-serif;padding:20px;}</style>
</head>
<body>${trimmed}</body>
</html>`;
}

/**
 * Claude 응답이 HTML인지 판별한다.
 */
export function isHtmlResponse(response: string): boolean {
  const trimmed = response.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.toLowerCase().startsWith('<html')) return true;
  if (response.match(/```(?:html)\s*\n[\s\S]*?\n```/)) return true;
  return false;
}

