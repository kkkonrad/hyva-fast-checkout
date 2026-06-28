const { chromium } = require('@playwright/test');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    console.log('Navigating to product page...');
    await page.goto('https://m10625.app-on-demand.net/joust-duffle-bag.html');
    console.log('Product page URL:', page.url());

    const btn = page.locator('#product-addtocart-button');
    console.log('Button visible:', await btn.isVisible());
    if (await btn.isVisible()) {
      console.log('Clicking add to cart button...');
      await btn.click();
      await page.waitForTimeout(3000);
    }

    console.log('Navigating to checkout...');
    await page.goto('https://m10625.app-on-demand.net/fast-checkout/');
    console.log('Checkout page URL:', page.url());

    const emailInput = page.locator('input[data-wire-field="email"]');
    console.log('Email input visible:', await emailInput.isVisible());

    await browser.close();
  } catch (err) {
    console.error('Error during test execution:', err);
  }
})();
