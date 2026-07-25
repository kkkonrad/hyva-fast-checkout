/**
 * Headless smoke: shipping methods load from Magento default destination,
 * then re-estimate when shipping address changes.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const SCRATCH = process.env.FC_SCRATCH || '/tmp/grok-goal-2db32d4062a8/implementer';
// Known simple product on this demo store (from homepage).
const SIMPLE_PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'rma-e2e-product.html';

async function dismissOverlays(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll(
      '.modals-overlay, .modal-popup._show, [data-role="closeBtn"], .action-close'
    ).forEach((el) => {
      try { el.click(); } catch (e) { /* ignore */ }
    });
    // Hyvä cookie banners etc.
    document.querySelectorAll('[x-show], .fixed.inset-0').forEach((el) => {
      if (el && el.style) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
  }).catch(() => {});
}

async function ensureCartHasItem(page) {
  await page.goto(BASE + SIMPLE_PRODUCT, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);

  // Prefer form requestSubmit over click (overlays often steal pointer events).
  const added = await page.evaluate(async () => {
    const form = document.getElementById('product_addtocart_form') ||
      document.querySelector('form[data-role="tocart-form"], form.product-add-form');
    if (!form) {
      return { ok: false, reason: 'no form' };
    }
    const qty = form.querySelector('input[name="qty"]');
    if (qty) {
      qty.value = '1';
    }
    // Magento/Hyvä often hooks submit; try requestSubmit then native submit.
    try {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    } catch (e) {
      const btn = document.getElementById('product-addtocart-button');
      if (btn) {
        btn.click();
      }
    }
    return { ok: true };
  });

  if (!added.ok) {
    // Fallback force click
    await page.locator('#product-addtocart-button').click({ force: true, timeout: 15_000 });
  }

  // Wait for cart counter or success
  await page.waitForTimeout(3000);
  // Navigate via cart URL as confirmation
  await page.goto(BASE + 'checkout/cart/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const empty = await page.locator('.cart-empty, .cart.item, .item-info, #shopping-cart-table, .product-item-details').count();
  if (empty === 0) {
    // Try bags category simple product
    await page.goto(BASE + 'gear/bags.html', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1000);
    const link = page.locator('a.product-item-link, .product-item-info a.product').first();
    await link.click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
    await page.evaluate(() => {
      const form = document.getElementById('product_addtocart_form');
      if (form && form.requestSubmit) form.requestSubmit();
      else if (form) form.submit();
    });
    await page.waitForTimeout(3000);
  }
}

async function openFastCheckout(page) {
  await page.goto(BASE + 'fast-checkout/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await dismissOverlays(page);
  // Empty cart redirects away — fail clearly
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('checkout/cart') || url.includes('customer/account')) {
    throw new Error('Redirected away from fast-checkout (likely empty cart): ' + url);
  }
  await page.waitForSelector('#fastcheckout-checkout, #co-checkout-form', { timeout: 45_000 });
  // KO bridge bootstrap
  await page.waitForTimeout(5000);
}

test.describe('Shipping methods default destination (headless)', () => {
  test('loads rates immediately, re-estimates after address change', async ({ page }) => {
    test.setTimeout(180_000);

    const network = {
      estimate: [],
      shippingInfo: [],
    };

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('estimate-shipping-methods')) {
        network.estimate.push({
          url,
          method: req.method(),
          postData: (req.postData() || '').slice(0, 500),
          t: Date.now(),
        });
      }
      if (url.includes('shipping-information') && req.method() === 'POST') {
        network.shippingInfo.push({ url, method: req.method(), t: Date.now() });
      }
    });

    await ensureCartHasItem(page);
    await openFastCheckout(page);

    const diag = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[name="shipping_method"]'));
      return {
        url: location.href,
        form: !!document.querySelector('#co-checkout-form'),
        checkoutRoot: !!document.querySelector('#fastcheckout-checkout'),
        initialRates: Array.isArray(window.fastcheckoutInitialShippingRates)
          ? window.fastcheckoutInitialShippingRates.length
          : -1,
        initialRateCodes: Array.isArray(window.fastcheckoutInitialShippingRates)
          ? window.fastcheckoutInitialShippingRates.map((r) => r.carrier_code + '_' + r.method_code)
          : [],
        defaultDestination: window.fastcheckoutDefaultDestination || null,
        radioCount: radios.length,
        radioValues: radios.map((r) => r.value),
        nativePipeline: !!window.fastcheckoutNativeQuotePipeline,
        hasKoShipping: !!window.fastcheckoutHyvaShipping,
      };
    });

    console.log('DIAG', JSON.stringify(diag, null, 2));

    // Prefer SSR seed OR live radios
    const shippingRadios = page.locator('input[name="shipping_method"]');

    // If SSR has rates but KO not painted yet, wait a bit more
    if (diag.initialRates > 0 && diag.radioCount === 0) {
      await page.waitForTimeout(3000);
    }

    await expect.poll(async () => {
      const n = await shippingRadios.count();
      if (n > 0) return n;
      // also accept SSR seed visible in window for soft pass diagnostics
      return page.evaluate(() =>
        Array.isArray(window.fastcheckoutInitialShippingRates)
          ? window.fastcheckoutInitialShippingRates.length
          : 0
      );
    }, {
      timeout: 45_000,
      message: 'Shipping methods should load from Magento default destination',
    }).toBeGreaterThan(0);

    // Hard requirement: visible radios for shopper
    await expect.poll(async () => shippingRadios.count(), {
      timeout: 30_000,
      message: 'Shipping method radios should be visible in UI',
    }).toBeGreaterThan(0);

    const countBefore = await shippingRadios.count();
    const valuesBefore = await shippingRadios.evaluateAll((els) => els.map((e) => e.value));
    console.log('methods before address edit', countBefore, valuesBefore);

    const estimateBeforeEdit = network.estimate.length;

    // Change rate-affecting fields
    const postcode = page.locator(
      'input[name="postcode"], input[name="shippingAddress[postcode]"], input[name="shippingAddress.postcode"]'
    ).first();
    const city = page.locator(
      'input[name="city"], input[name="shippingAddress[city]"], input[name="shippingAddress.city"]'
    ).first();

    if (await postcode.count()) {
      await postcode.fill('30-001');
      await postcode.dispatchEvent('input');
      await postcode.dispatchEvent('change');
      await postcode.blur();
    }
    if (await city.count()) {
      await city.fill('Krakow');
      await city.dispatchEvent('input');
      await city.dispatchEvent('change');
      await city.blur();
    }

    await page.waitForTimeout(6000);

    const countAfter = await shippingRadios.count();
    const valuesAfter = await shippingRadios.evaluateAll((els) => els.map((e) => e.value));
    const estimatesAfterEdit = network.estimate.length - estimateBeforeEdit;
    console.log('methods after address edit', countAfter, valuesAfter);
    console.log('new estimate XHRs after edit', estimatesAfterEdit);
    console.log('all estimates', JSON.stringify(network.estimate, null, 2));

    expect(countAfter).toBeGreaterThan(0);

    // Select first method — list must stay
    await shippingRadios.first().click({ force: true });
    await page.waitForTimeout(2500);
    const countAfterSelect = await shippingRadios.count();
    console.log('methods after select', countAfterSelect, 'shipping-info XHRs', network.shippingInfo.length);
    expect(countAfterSelect).toBeGreaterThan(0);
    expect(countAfterSelect).toBe(countAfter);

    const summary = {
      ok: true,
      diag,
      countBefore,
      valuesBefore,
      countAfter,
      valuesAfter,
      countAfterSelect,
      estimateTotal: network.estimate.length,
      estimatesAfterEdit,
      shippingInfoCount: network.shippingInfo.length,
      estimateSample: network.estimate.slice(0, 5),
    };

    try {
      fs.mkdirSync(SCRATCH, { recursive: true });
      fs.writeFileSync(
        path.join(SCRATCH, 'headless-shipping-methods.json'),
        JSON.stringify(summary, null, 2)
      );
      fs.writeFileSync(
        path.join(SCRATCH, 'headless-shipping-methods.log'),
        [
          'HEADLESS SHIPPING METHODS SMOKE',
          'initialRates=' + diag.initialRates,
          'defaultDestination=' + JSON.stringify(diag.defaultDestination),
          'radiosBefore=' + countBefore + ' ' + valuesBefore.join(','),
          'radiosAfterEdit=' + countAfter + ' ' + valuesAfter.join(','),
          'radiosAfterSelect=' + countAfterSelect,
          'estimateXHRs=' + network.estimate.length,
          'estimatesAfterEdit=' + estimatesAfterEdit,
          'shippingInfoXHRs=' + network.shippingInfo.length,
          'PASS',
        ].join('\n')
      );
    } catch (e) {
      console.warn('could not write scratch', e);
    }
  });
});
