import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs-extra';

/**
 * Uploads a PDF to Catbox.moe — permanently free, public URLs, no account needed.
 * Max file size: 200MB. Returns a permanent public URL like:
 *   https://files.catbox.moe/xxxxxx.pdf
 *
 * API docs: https://catbox.moe/tools.php
 */
export async function uploadToCatbox(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const fileName = filePath.split(/[\\/]/).pop() || 'notification.pdf';

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fileBuffer, {
      filename: fileName,
      contentType: 'application/pdf',
    });

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 60000, // 60s for upload
    });

    if (response.status === 200 && typeof response.data === 'string' && response.data.startsWith('https://')) {
      const url = response.data.trim();
      console.log(`✅ PDF uploaded to Catbox: ${url}`);
      return url;
    }

    console.warn('Catbox upload unexpected response:', response.data);
    return null;
  } catch (error: any) {
    console.error('Catbox upload failed:', error?.message || error);
    return null;
  }
}
