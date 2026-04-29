import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface JobInsert {
  title: string;
  department: string;
  vacancies?: number;
  application_start?: string;
  application_end?: string;
  apply_url?: string;
  notification_pdf_url?: string;
  category_filter?: string;
  salary_from?: number;
  salary_to?: number;
  education_required?: string;
  age_min?: number;
  age_max?: number;
  status?: string;
  is_active?: boolean;
  details?: Record<string, any>;
}

export async function checkJobExists(advtNo: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .contains('details', { advt_no: advtNo })
    .limit(1);

  if (error) {
    console.error('Error checking job existence:', error.message);
    return false;
  }
  return data && data.length > 0;
}

export async function insertJob(job: JobInsert) {
  const { data, error } = await supabase.from('jobs').insert([job]).select();

  if (error) {
    console.error('Error inserting job:', error.message);
    return null;
  }
  return data[0];
}

export async function addJobEvent(
  jobId: string,
  type: string,
  date: string,
  title: string,
  url?: string,
) {
  const { error } = await supabase.from('job_events').insert([
    {
      job_id: jobId,
      type,
      date,
      title,
      external_link: url,
    },
  ]);

  if (error) {
    console.error('Error adding job event:', error.message);
  }
}
