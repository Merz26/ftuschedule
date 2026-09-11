import { chromium } from 'playwright';

(async () => {
  console.log("Starting visual verification suite...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Assuming local dev server runs on port 3000
  const url = process.env.APP_URL || 'http://localhost:3000';
  await page.goto(url);
  
  // Wait for the iframe to load
  await page.waitForSelector('iframe');
  
  // Screenshot the main view
  await page.screenshot({ path: 'scripts/screenshot_light_en.png' });
  
  // We can interact with iframe elements if needed
  // For the sake of the script, we just capture the preview frame
  console.log("Screenshots captured successfully.");

  await browser.close();
})();
