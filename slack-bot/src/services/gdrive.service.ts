import { google } from 'googleapis';
import { ENV } from '../config.js';
import { Readable } from 'stream';

/** Google Drive 업로드 결과 */
export interface GDriveUploadResult {
  fileId: string;
  webViewLink: string;
}

/**
 * JWT 인증 Drive 클라이언트를 생성한다.
 */
function createDriveClient() {
  const auth = new google.auth.JWT({
    email: ENV.GOOGLE_CLIENT_EMAIL,
    key: ENV.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * HTML 문자열을 Google Drive에 업로드하고 공유 링크를 반환한다.
 */
export async function uploadHtmlToGDrive(
  htmlContent: string,
  fileName: string,
): Promise<GDriveUploadResult> {
  const drive = createDriveClient();

  // 파일 업로드
  const fileMetadata: any = {
    name: fileName,
    mimeType: 'text/html',
  };
  if (ENV.GOOGLE_DRIVE_FOLDER_ID) {
    fileMetadata.parents = [ENV.GOOGLE_DRIVE_FOLDER_ID];
  }

  const media = {
    mimeType: 'text/html',
    body: Readable.from(Buffer.from(htmlContent, 'utf-8')),
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink',
  });

  const fileId = file.data.id!;

  // 링크가 있는 모든 사용자에게 보기 권한 부여
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  // webViewLink 가져오기 (create 응답에 없을 수 있으므로 재조회)
  let webViewLink = file.data.webViewLink;
  if (!webViewLink) {
    const updated = await drive.files.get({
      fileId,
      fields: 'webViewLink',
    });
    webViewLink = updated.data.webViewLink;
  }

  return {
    fileId,
    webViewLink: webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}
