import { chromium } from 'playwright-extra';
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

export interface OjasJobListing {
  advtNo: string;
  title: string;
  endsOn: string;
  fees: string;
  contactInfo: string;
  detailsUrl: string;
  deptValue: string;
}

export class OjasScraper {
  private url = 'https://ojas.gujarat.gov.in/AdvtList.aspx?type=lCxUjNjnTp8=';

  async scrapeListings(): Promise<OjasJobListing[]> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      console.log(`Navigating to ${this.url}...`);
      await page.goto(this.url, { waitUntil: 'networkidle' });

      const dropdownSelector = 'select#ddlDept';
      await page.waitForSelector(dropdownSelector);

      const deptValues = await page.evaluate((sel) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        return Array.from(select.options)
          .map(opt => opt.value)
          .filter(val => val !== '0' && val !== '');
      }, dropdownSelector);

      console.log(`Found ${deptValues.length} departments to check.`);

      const allListings: OjasJobListing[] = [];

      for (const deptValue of deptValues) {
        console.log(`Checking department: ${deptValue}`);
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
            page.selectOption(dropdownSelector, deptValue)
          ]);
        } catch (e) {
          // If no response, table might not be there
        }

        const tableSelector = 'table#dgJobList';
        const rows = page.locator(`${tableSelector} tr:not(:first-child)`);
        const count = await rows.count();
        
        if (count === 0) {
          console.log(`No jobs in department ${deptValue}`);
          continue;
        }

        console.log(`Found ${count} jobs in this department.`);

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const cells = row.locator('td');
          
          const listing: OjasJobListing = {
            advtNo: (await cells.nth(0).innerText()).trim(),
            title: (await cells.nth(1).innerText()).trim(),
            endsOn: (await cells.nth(2).innerText()).trim(),
            fees: (await cells.nth(3).innerText()).trim(),
            contactInfo: (await cells.nth(4).innerText()).trim(),
            // Store the unique name of the Details button for this row
            detailsUrl: await cells.nth(6).locator('input[type="submit"]').getAttribute('name') || '',
            deptValue: deptValue
          };
          allListings.push(listing);
        }
      }

      return allListings;

    } catch (error) {
      console.error('Error during OJAS scraping:', error);
      return [];
    } finally {
      await browser.close();
    }
  }

  async downloadPdf(buttonName: string, deptValue: string, outputPath: string): Promise<boolean> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      await page.goto(this.url, { waitUntil: 'networkidle' });
      
      console.log(`Selecting department ${deptValue} before download...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
        page.selectOption('select#ddlDept', deptValue)
      ]);
      
      console.log(`Attempting to click Details button: ${buttonName}`);
      
      // Handle the download
      const [ download ] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click(`input[name="${buttonName}"]`)
      ]);

      await download.saveAs(outputPath);
      console.log(`PDF saved to ${outputPath}`);
      return true;
    } catch (error) {
      console.error(`Download failed for ${buttonName}:`, error);
      return false;
    } finally {
      await browser.close();
    }
  }
}
