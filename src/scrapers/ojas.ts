import { chromium } from 'playwright-extra';
import axios from 'axios';
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const useAuto = process.env.SCRAPER_PROXY === 'auto';
    let autoProxies: string[] = [];
    if (useAuto) {
      autoProxies = await this.fetchFreeIndianProxies();
    }

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    let context: any;
    let page: any;

    try {
      console.log(`Navigating to ${this.url}...`);
      
      // Retry logic for navigation to handle transient CI network issues or slow site response
      let retries = 3;
      let attempt = 0;
      while (retries > 0) {
        attempt++;
        let proxyServer = process.env.SCRAPER_PROXY;
        if (useAuto && autoProxies.length > 0) {
          proxyServer = autoProxies[Math.floor(Math.random() * autoProxies.length)];
          console.log(`[Attempt ${attempt}] Using auto proxy: ${proxyServer}`);
        } else if (proxyServer && proxyServer !== 'auto') {
          console.log(`[Attempt ${attempt}] Using configured proxy: ${proxyServer}`);
        }

        context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          proxy: proxyServer && proxyServer !== 'auto' ? {
            server: proxyServer,
            ...(process.env.SCRAPER_PROXY_USERNAME && { username: process.env.SCRAPER_PROXY_USERNAME }),
            ...(process.env.SCRAPER_PROXY_PASSWORD && { password: process.env.SCRAPER_PROXY_PASSWORD }),
          } : undefined
        });
        page = await context.newPage();

        try {
          await page.goto(this.url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 90000 // 90 seconds
          });
          break; // Success
        } catch (error) {
          retries--;
          console.warn(`Navigation failed. Retries remaining: ${retries}. Error: ${error instanceof Error ? error.message : error}`);
          await context.close();
          if (retries === 0) throw error;
          await delay(5000); // Wait 5s before retry
        }
      }
      
      // Wait for the dropdown specifically instead of waiting for the entire network to be idle
      const dropdownSelector = 'select#ddlDept';
      await page.waitForSelector(dropdownSelector, { timeout: 30000 });

      const deptValues = await page.evaluate((sel: string) => {
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
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
            page.selectOption(dropdownSelector, deptValue)
          ]);
          // Small delay to let the table render
          await delay(1000);
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
      throw error; // Rethrow to let index.ts handle notification
    } finally {
      await browser.close();
    }
  }

  async downloadPdf(buttonName: string, deptValue: string, outputPath: string): Promise<boolean> {
    const useAuto = process.env.SCRAPER_PROXY === 'auto';
    let autoProxies: string[] = [];
    if (useAuto) {
      autoProxies = await this.fetchFreeIndianProxies();
    }

    const browser = await chromium.launch({ 
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    
    let context: any;
    let page: any;
    
    try {
      let retries = 3;
      let attempt = 0;
      while (retries > 0) {
        attempt++;
        let proxyServer = process.env.SCRAPER_PROXY;
        if (useAuto && autoProxies.length > 0) {
          proxyServer = autoProxies[Math.floor(Math.random() * autoProxies.length)];
          console.log(`[Download Attempt ${attempt}] Using auto proxy: ${proxyServer}`);
        } else if (proxyServer && proxyServer !== 'auto') {
          console.log(`[Download Attempt ${attempt}] Using configured proxy: ${proxyServer}`);
        }

        context = await browser.newContext({
          proxy: proxyServer && proxyServer !== 'auto' ? {
            server: proxyServer,
            ...(process.env.SCRAPER_PROXY_USERNAME && { username: process.env.SCRAPER_PROXY_USERNAME }),
            ...(process.env.SCRAPER_PROXY_PASSWORD && { password: process.env.SCRAPER_PROXY_PASSWORD }),
          } : undefined
        });
        page = await context.newPage();

        try {
          await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
          break;
        } catch (error) {
          retries--;
          await context.close();
          if (retries === 0) throw error;
          await delay(5000);
        }
      }
      
      console.log(`Selecting department ${deptValue} before download...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
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

  private async fetchFreeIndianProxies(): Promise<string[]> {
    try {
      console.log('Fetching free Indian proxies from ProxyScrape...');
      const response = await axios.get('https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&country=in', { timeout: 10000 });
      const list = response.data
        .split('\n')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0 && (p.startsWith('http://') || p.startsWith('socks4://') || p.startsWith('socks5://')));
      console.log(`Fetched ${list.length} free Indian proxies.`);
      return list;
    } catch (error) {
      console.warn('Failed to fetch free proxies:', error instanceof Error ? error.message : error);
      return [];
    }
  }
}
