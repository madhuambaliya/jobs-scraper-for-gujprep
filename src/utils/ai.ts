import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ExtractedJobDetails {
  vacancies?: number;
  age_min?: number;
  age_max?: number;
  qualification?: string;
  salary_from?: number;
  salary_to?: number;
  salary_display?: string;
  application_start?: string;
  application_end?: string;
  exam_date?: string;
  category?: string;
  selection_process?: string;
  application_fee?: string;
  posting_location?: string;
}

export class GeminiExtractor {
  private model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  async extractFromText(text: string): Promise<ExtractedJobDetails> {
    if (!process.env.GEMINI_API_KEY) {
      console.error('CRITICAL: GEMINI_API_KEY is not set in .env file.');
      return {};
    }

    // Smart Trimming: Most important info is in the first 8 pages (~20k characters)
    const MAX_CHARS = 20000;
    const trimmedText =
      text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '... [TRUNCATED]' : text;

    console.log(`Sending ${trimmedText.length} characters to Gemini for analysis...`);

    const prompt = `
      You are an expert recruitment data analyst specializing in Gujarat Government (OJAS) job notifications.
      The text is primarily in Gujarati script but may contain English. Extract ALL possible fields.
      
      Return ONLY a valid JSON object with exactly these keys (use null for any field not found):

      - vacancies (number): The TOTAL number of posts/vacancies across all categories.
      - age_min (number): Minimum age in years required to apply (usually 18).
      - age_max (number): Maximum age in years for GENERAL/OPEN category (find the highest unreserved upper limit).
      - qualification (string): Required educational qualification, summarized clearly in English (degree, diploma, field).
      - salary_from (number): Minimum monthly pay/salary in INR as a plain integer (e.g., 35400). Extract from Pay Matrix or pay scale (e.g., "Pay Band 2, Rs. 9,300–34,800 + GP 4600" → salary_from=13900, salary_to=34800). If Level/Pay Matrix is given (e.g., Level-6), use known 7th Pay Commission values.
      - salary_to (number): Maximum monthly pay/salary in INR as a plain integer.
      - salary_display (string): The raw salary/pay-scale text as it appears in the document (e.g., "Rs. 35,400 - 1,12,400/- (Level-6)").
      - application_start (string): Application start date in YYYY-MM-DD format (look for phrases like "Online application from").
      - application_end (string): Application end date in YYYY-MM-DD format (last date to apply).
      - exam_date (string): Examination date in YYYY-MM-DD format if explicitly mentioned, else null.
      - category (string): Job class/category: one of 'Class-1', 'Class-2', 'Class-3', 'Class-4', 'Medical', 'Police', 'Teaching', 'Engineering', 'Clerk', 'Other'.
      - selection_process (string): Brief English summary of selection process (e.g., "Written Exam + Interview", "Written Exam only").
      - application_fee (string): Application fee details in English (e.g., "General: ₹100 + SBI E-Pay charges; SC/ST/PH: Exempt").
      - posting_location (string): State/District of posting if mentioned (e.g., "Gujarat", "District Panchayats across Gujarat").

      IMPORTANT RULES:
      - Gujarati digits (૦,૧,૨,૩,૪,૫,૬,૭,૮,૯) = Arabic digits (0,1,2,3,4,5,6,7,8,9)
      - Dates in Gujarati format "DD-MM-YYYY" or "DD/MM/YYYY" → convert to YYYY-MM-DD
      - For salary, look for keywords: "પગાર", "Pay Band", "Level", "Pay Matrix", "GP", "ગ્રેડ પે"
      - For vacancies, look for "જગ્યા", "Posts", "Vacancies", "Ku lJa yana", "ȢuLJa∂yao"
      - For age, look for "ઉંમર", "Age", "વર્ષ", "years"
      - Return null (not empty string or 0) for any field you cannot find with confidence

      Job Notification Text:
      """
      ${trimmedText}
      """
    `;

    try {
      const MAX_RETRIES = 3;
      let lastError: any;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`Sending request to Gemini 2.5 Flash (attempt ${attempt})...`);
          const result = await this.model.generateContent(prompt);
          const response = await result.response;
          const jsonStr = response.text();
          const parsed = JSON.parse(jsonStr) as ExtractedJobDetails;

          // Clean up: replace explicit nulls with undefined so they don't get inserted
          const cleaned: ExtractedJobDetails = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (value !== null && value !== undefined && value !== '') {
              (cleaned as any)[key] = value;
            }
          }

          console.log('Extracted details:', JSON.stringify(cleaned, null, 2));
          return cleaned;
        } catch (err: any) {
          lastError = err;
          if (err?.status === 503 || err?.status === 429) {
            const delay = 5000 * attempt;
            console.warn(`Gemini ${err.status} – retrying in ${delay / 1000}s...`);
            await new Promise((r) => setTimeout(r, delay));
          } else {
            throw err;
          }
        }
      }
      throw lastError;
    } catch (error) {
      console.error('Gemini Extraction Error:', error);
      return {};
    }
  }
}
