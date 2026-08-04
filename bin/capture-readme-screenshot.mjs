#!/usr/bin/env node
/**
 * Capture docs/images/checkout.png for README (headless Chromium + system fonts).
 *
 * Usage (from Magento root or module):
 *   node app/code/Kkkonrad/Fastcheckout/bin/capture-readme-screenshot.mjs
 *   FC_SHOT_BASE_URL=https://m10625.app-on-demand.net/ node bin/capture-readme-screenshot.mjs
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, stat } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../Test/E2e/package.json'));
const { chromium } = require('playwright');
const BASE = process.env.FC_SHOT_BASE_URL || 'https://m10625.app-on-demand.net/';
const PRODUCT = process.env.FC_SHOT_PRODUCT || 'aim-analog-watch.html';
const out = resolve(__dirname, '../docs/images/checkout.png');

const FONT_CSS = `
  html, body, button, input, select, textarea, label, span, p, h1, h2, h3, h4, a, li, td, th, div {
    font-family: "Noto Sans", "Open Sans", Roboto, "Liberation Sans", sans-serif !important;
    -webkit-font-smoothing: antialiased !important;
  }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .loading-mask, [data-role="loader"], .mage-loader, .spinner { display: none !important; }
`;

async function injectFonts(page) {
  await page.addStyleTag({ content: FONT_CSS }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--font-render-hinting=none',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
    deviceScaleFactor: 1,
    locale: 'pl-PL',
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  context.setDefaultTimeout(45_000);
  const page = await context.newPage();

  console.log('Login page…');
  await page.goto(new URL('customer/account/login/', BASE).href, { waitUntil: 'domcontentloaded' });
  const formKey = await page.locator('input[name="form_key"]').first().inputValue();

  console.log('Product…');
  await page.goto(new URL(PRODUCT, BASE).href, { waitUntil: 'domcontentloaded' });
  await injectFonts(page);
  await page.locator('#product_addtocart_form input[name="form_key"]')
    .evaluate((input, value) => { input.value = value; }, formKey);
  const addToCart = page.getByRole('button', { name: /Dodaj do koszyka|Add to Cart/i });
  await addToCart.waitFor({ state: 'visible' });
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/checkout/cart/add'),
      { timeout: 45_000 }
    ),
    addToCart.click(),
  ]);

  console.log('Checkout…');
  await page.goto(new URL('checkout/?shot=' + Date.now(), BASE).href, { waitUntil: 'domcontentloaded' });
  await page.locator('#fastcheckout-checkout').waitFor({ state: 'visible', timeout: 60_000 });
  await injectFonts(page);

  const shipping = page.locator('.fastcheckout-native-shipping-address');
  await shipping.locator('input[name="email"]').waitFor({ state: 'visible' });

  async function fillDemoAddress() {
    await shipping.locator('select[name="country_id"]').selectOption('PL').catch(() => {});
    await page.waitForFunction(() => {
      const sel = document.querySelector('.fastcheckout-native-shipping-address select[name="region_id"]');
      return sel && sel.querySelectorAll('option:not([value=""])').length > 0;
    }, null, { timeout: 30_000 }).catch(() => {});
    await shipping.locator('select[name="region_id"]').selectOption({ index: 1 }).catch(() => {});
    await shipping.locator('input[name="email"]').fill('jan.kowalski@example.com');
    await shipping.locator('input[name="firstname"]').fill('Jan');
    await shipping.locator('input[name="lastname"]').fill('Kowalski');
    await shipping.locator('input[name="street[0]"]').fill('Testowa 1');
    await shipping.locator('input[name="city"]').fill('Warszawa');
    await shipping.locator('input[name="postcode"]').fill('00-001');
    await shipping.locator('input[name="telephone"]').fill('500 600 700');
    await shipping.locator('input[name="telephone"]').blur();
  }

  // Country first so rates can load, then full address.
  await shipping.locator('select[name="country_id"]').selectOption('PL').catch(() => {});
  await page.waitForFunction(() => {
    const sel = document.querySelector('.fastcheckout-native-shipping-address select[name="region_id"]');
    return sel && sel.querySelectorAll('option:not([value=""])').length > 0;
  }, null, { timeout: 30_000 }).catch(() => {});
  await shipping.locator('select[name="region_id"]').selectOption({ index: 1 }).catch(() => {});
  await shipping.locator('input[name="postcode"]').fill('00-001');
  await shipping.locator('input[name="postcode"]').blur();

  console.log('Wait shipping rates…');
  try {
    await page.waitForSelector('input[name="shipping_method"]:not([disabled])', { timeout: 45_000 });
    // Prefer a classic carrier (not InPost locker) so payment methods stay visible.
    const shipCode = await page.locator('input[name="shipping_method"]:not([disabled])').evaluateAll((inputs) => {
      const preferred = inputs.find((input) => {
        const v = String(input.value || '').toLowerCase();
        const label = (input.closest('label, tr, .col, li, div') || input.parentElement);
        const text = (label && label.textContent || '').toLowerCase();
        return !/inpost|paczkomat|locker/.test(v + ' ' + text);
      });
      return preferred ? preferred.value : (inputs[0] && inputs[0].value) || '';
    });
    if (shipCode) {
      await page.locator('input[name="shipping_method"][value="' + shipCode.replace(/"/g, '') + '"]')
        .evaluate((el) => el.click());
    } else {
      await page.locator('input[name="shipping_method"]:not([disabled])').first().evaluate((el) => el.click());
    }
    await page.waitForTimeout(2500);
  } catch (e) {
    console.warn('Shipping methods not ready:', e.message);
  }

  // Fill personal fields after rate/payment remap so KO does not wipe them.
  await fillDemoAddress();
  await page.waitForTimeout(800);

  try {
    await page.waitForSelector('input[name="payment_method"]:not([disabled])', { timeout: 20_000 });
    const payCode = await page.locator('input[name="payment_method"]:not([disabled])').evaluateAll((inputs) => {
      const offline = inputs.find((input) => /checkmo|banktransfer|cashondelivery|purchaseorder/i.test(input.value));
      return (offline || inputs[0] || {}).value || '';
    });
    if (payCode) {
      await page.locator('input[name="payment_method"][value="' + String(payCode).replace(/"/g, '') + '"]')
        .evaluate((el) => el.click());
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    console.warn('Payment select skipped:', e.message);
  }

  // Re-assert name fields right before freeze (payment select can re-render address).
  await shipping.locator('input[name="firstname"]').fill('Jan');
  await shipping.locator('input[name="lastname"]').fill('Kowalski');
  await shipping.locator('input[name="email"]').fill('jan.kowalski@example.com');
  await shipping.locator('input[name="street[0]"]').fill('Testowa 1');
  await shipping.locator('input[name="city"]').fill('Warszawa');
  await shipping.locator('input[name="postcode"]').fill('00-001');
  await shipping.locator('input[name="telephone"]').fill('500 600 700');
  await page.waitForTimeout(300);

  await injectFonts(page);
  // Build a minimal static document from the checkout markup only.
  // Full Magento pages hang headless capture on this host (KO/PayU/compositor).
  console.log('Freeze checkout fragment…');
  const fragment = await page.evaluate(() => {
    // Persist JS-driven field state into attributes so outerHTML keeps values.
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      const tag = el.tagName;
      if (tag === 'TEXTAREA') {
        el.textContent = el.value;
        return;
      }
      if (tag === 'SELECT') {
        Array.from(el.options).forEach((opt) => {
          if (opt.selected) {
            opt.setAttribute('selected', 'selected');
          } else {
            opt.removeAttribute('selected');
          }
        });
        return;
      }
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) {
          el.setAttribute('checked', 'checked');
        } else {
          el.removeAttribute('checked');
        }
        return;
      }
      el.setAttribute('value', el.value == null ? '' : String(el.value));
    });

    // Drop KO validation noise on snapshot (empty-error flash).
    document.querySelectorAll('._error, .mage-error, [aria-invalid="true"]').forEach((el) => {
      el.classList.remove('_error', 'mage-error');
      el.removeAttribute('aria-invalid');
    });
    document.querySelectorAll('.field-error, .admin__field-error, label.mage-error, div.mage-error')
      .forEach((el) => {
        try {
          el.remove();
        } catch (e) {
          // ignore
        }
      });

    const root = document.querySelector('#maincontent') ||
      document.querySelector('#fastcheckout-checkout') ||
      document.body;
    const styles = [];
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      styles.push(node.outerHTML);
    });
    return {
      origin: location.origin,
      styles: styles.join('\n'),
      body: root ? root.outerHTML : '',
      title: document.title || 'Checkout',
    };
  });

  const staticHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8"/>
  <base href="${fragment.origin}/"/>
  <title>${fragment.title.replace(/</g, '')}</title>
  ${fragment.styles}
  <style>
    html, body, button, input, select, textarea, label, span, p, h1, h2, h3, h4, a, li, td, th, div {
      font-family: "Noto Sans", "Open Sans", Roboto, "Liberation Sans", sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
    }
    body { margin: 0; background: #f3f4f6; }
    *, *::before, *::after { animation: none !important; transition: none !important; }
    iframe, video, canvas { display: none !important; }
  </style>
</head>
<body>
${fragment.body}
</body>
</html>`;

  // Fresh page — no leftover KO timers / websockets.
  const shotPage = await context.newPage();
  await shotPage.setViewportSize({ width: 1440, height: 1600 });
  await shotPage.setContent(staticHtml, { waitUntil: 'networkidle', timeout: 60_000 }).catch(async () => {
    await shotPage.setContent(staticHtml, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  });
  await shotPage.waitForTimeout(400);

  await mkdir(resolve(out, '..'), { recursive: true });
  console.log('Screenshot…');

  const client = await context.newCDPSession(shotPage);
  const shot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1440, height: 1600, scale: 1 },
  });
  await writeFile(out, Buffer.from(shot.data, 'base64'));

  const st = await stat(out);
  console.log('Wrote', out, st.size, 'bytes');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
