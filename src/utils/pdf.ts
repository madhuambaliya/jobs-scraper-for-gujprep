import fs from 'fs-extra';
import { PDFParse } from 'pdf-parse';
import { GeminiExtractor, ExtractedJobDetails } from './ai';

export interface PdfData {
  details: ExtractedJobDetails;
  rawText: string;
}

export class PdfExtractor {
  private ai = new GeminiExtractor();

  async extractDetails(filePath: string): Promise<PdfData> {
    let parser;
    try {
      const dataBuffer = await fs.readFile(filePath);
      parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      const text = result.text;
      await parser.destroy();

      console.log('PDF text extracted, passing to AI for analysis...');
      const details = await this.ai.extractFromText(text);

      return {
        rawText: text,
        details
      };
    } catch (error) {
      console.error('Error extracting PDF details:', error);
      return { rawText: '', details: {} };
    } finally {
      if (parser) {
        try { await parser.destroy(); } catch (e) {}
      }
    }
  }
}
