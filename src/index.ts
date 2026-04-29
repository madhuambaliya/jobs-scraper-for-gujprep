import { OjasScraper } from './scrapers/ojas';
import { PdfExtractor } from './utils/pdf';
import { uploadToCatbox } from './utils/catbox';
import { checkJobExists, insertJob, addJobEvent, JobInsert } from './db/jobs';
import path from 'path';
import fs from 'fs-extra';
import dotenv from 'dotenv';

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === 'true';

async function run() {
  console.log(`=== Starting OJAS Job Scraper${DRY_RUN ? ' [DRY RUN]' : ''} ===`);

  const scraper = new OjasScraper();
  const pdfExtractor = new PdfExtractor();

  const listings = await scraper.scrapeListings();
  console.log(`Found ${listings.length} listings on OJAS.`);

  for (const listing of listings) {
    try {
      const exists = await checkJobExists(listing.advtNo);
      if (exists) {
        console.log(`Skipping existing job: ${listing.advtNo}`);
        continue;
      }

      const dept = listing.advtNo.split('/')[0];

      console.log(`Processing new job: ${listing.advtNo} - ${listing.title}`);

      // 1. Download PDF
      const pdfFileName = `${listing.advtNo.replace(/\//g, '_')}.pdf`;
      const pdfPath = path.join(__dirname, '../temp_pdfs', pdfFileName);
      await fs.ensureDir(path.dirname(pdfPath));

      const downloaded = await scraper.downloadPdf(listing.detailsUrl, listing.deptValue, pdfPath);

      let extraDetails: any = {};
      let notificationPdfUrl: string | null = null;

      if (downloaded) {
        if (!DRY_RUN) {
          // 2. Upload PDF to Catbox for permanent public URL
          console.log('Uploading PDF to Catbox.moe...');
          notificationPdfUrl = await uploadToCatbox(pdfPath);
        }

        // 3. Extract details with AI
        const result = await pdfExtractor.extractDetails(pdfPath);
        extraDetails = result.details;

        // Clean up temp PDF after upload
        try { await fs.remove(pdfPath); } catch (e) {}
      }

      // 4. Prepare Insert
      const jobData: JobInsert = {
        title: listing.title,
        department: dept,
        application_end: extraDetails.application_end || parseOjasDate(listing.endsOn),
        application_start: extraDetails.application_start,
        apply_url: 'https://ojas.gujarat.gov.in/AdvtList.aspx?type=lCxUjNjnTp8=',
        notification_pdf_url: notificationPdfUrl || listing.detailsUrl,
        vacancies: extraDetails.vacancies,
        age_min: extraDetails.age_min,
        age_max: extraDetails.age_max,
        education_required: extraDetails.qualification,
        category_filter: extraDetails.category || 'government',
        salary_from: extraDetails.salary_from,
        salary_to: extraDetails.salary_to,
        status: 'open',
        is_active: true,
        details: {
          advt_no: listing.advtNo,
          salary_display: extraDetails.salary_display,
          selection_process: extraDetails.selection_process,
          application_fee: extraDetails.application_fee,
          posting_location: extraDetails.posting_location,
          ...extraDetails,
        },
      };

      if (DRY_RUN) {
        console.log('[DRY RUN] Would insert job:', JSON.stringify({ title: jobData.title, department: jobData.department, vacancies: jobData.vacancies }, null, 2));
        continue;
      }

      const newJob = await insertJob(jobData);

      if (newJob) {
        console.log(`✅ Inserted job ID: ${newJob.id}`);

        // 5. Timeline events
        if (jobData.application_start) {
          await addJobEvent(newJob.id, 'APPLICATION_START', jobData.application_start, 'Application Opens');
        }
        if (jobData.application_end) {
          await addJobEvent(
            newJob.id,
            'APPLICATION_END',
            jobData.application_end,
            'Last Date to Apply',
            notificationPdfUrl || undefined,
          );
        }
        if (extraDetails.exam_date) {
          await addJobEvent(newJob.id, 'EXAM_DATE', extraDetails.exam_date, 'Written Examination');
        }
      }
    } catch (error) {
      console.error(`Error processing listing ${listing.advtNo}:`, error);
    }
  }

  console.log('=== OJAS Scraper Run Complete ===');
}

function parseOjasDate(dateStr: string): string {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart || '00:00:00'}`;
}

run().catch(console.error);
