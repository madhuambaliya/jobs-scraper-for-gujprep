import nodemailer from 'nodemailer';

/**
 * Sends an error notification email.
 * Requires EMAIL_USER and EMAIL_PASS (App Password) environment variables.
 */
export async function sendErrorEmail(error: any) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const recipient = 'madhuambaliya0@gmail.com';

  // Only send emails if running in GitHub Actions (CI)
  if (!process.env.GITHUB_ACTIONS) {
    console.log('ℹ️ Local execution detected. Skipping error email notification.');
    return;
  }

  if (!user || !pass) {
    console.warn('⚠️ EMAIL_USER or EMAIL_PASS not set. Skipping error email notification.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass,
    },
  });

  const mailOptions = {
    from: `"GujPrep Job Scraper" <${user}>`,
    to: recipient,
    subject: '🚨 OJAS Scraper Failure Notification',
    html: `
      <h2>OJAS Scraper Failed</h2>
      <p>The automated job scraper encountered an error and could not complete its run.</p>
      <hr>
      <p><strong>Error Message:</strong></p>
      <pre style="background: #f4f4f4; padding: 10px; border: 1px solid #ddd;">${error?.message || error}</pre>
      <p><strong>Current OJAS URL:</strong></p>
      <code>https://ojas.gujarat.gov.in/AdvtList.aspx?type=lCxUjNjnTp8=</code>
      <hr>
      <p>Please check the <a href="https://github.com/madhuambaliya/jobs-scraper-for-gujprep/actions">GitHub Actions logs</a> for more details.</p>
      <p>You can update the URL manually in <code>src/scrapers/ojas.ts</code> if the website URL has changed.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Error notification email sent:', info.messageId);
  } catch (err) {
    console.error('❌ Failed to send error notification email:', err);
  }
}
