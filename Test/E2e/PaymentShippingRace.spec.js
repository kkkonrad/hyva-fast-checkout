import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'aim-analog-watch.html';

async function openCheckout(page) {
  await page.goto(new URL('customer/account/login/', BASE).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const formKey = await page.locator('input[name="form_key"]').first().inputValue().catch(() => '');
  await page.goto(new URL(PRODUCT, BASE).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (formKey) {
    await page.locator('#product_addtocart_form input[name="form_key"]').evaluate((i, v) => { i.value = v; }, formKey).catch(() => {});
  }
  await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/checkout/cart/add'), { timeout: 30000 }).catch(() => null),
    page.getByRole('button', { name: /Dodaj do koszyka|Add to Cart/i }).click()
  ]);
  await page.goto(new URL('checkout/?psr=' + Date.now(), BASE).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#fastcheckout-checkout')).toBeVisible({ timeout: 45000 });
}

test('set-payment-information does not error missing shipping address after shipping select', async ({ page }) => {
  test.setTimeout(120000);
  const paymentErrors = [];
  page.on('response', async (response) => {
    if (response.request().method() !== 'POST') return;
    if (!/set-payment-information|payment-information/i.test(response.url())) return;
    if (response.status() < 400) return;
    let body = '';
    try { body = await response.text(); } catch (e) {}
    if (/shipping address is missing|Brak adresu wysyłki/i.test(body)) {
      paymentErrors.push(response.status() + ' ' + response.url() + ' ' + body.slice(0, 200));
    }
  });

  await openCheckout(page);

  // Fill minimal shipping so rates + method + payment remap run
  const shipping = page.locator('.fastcheckout-native-shipping-address');
  await shipping.locator('select[name="country_id"]').selectOption('PL').catch(() => {});
  await page.waitForTimeout(800);
  const region = shipping.locator('select[name="region_id"]');
  if (await region.count()) {
    await page.waitForFunction(() => document.querySelectorAll('.fastcheckout-native-shipping-address select[name="region_id"] option:not([value=""])').length > 0).catch(() => {});
    await region.selectOption({ index: 1 }).catch(() => {});
  }
  await shipping.locator('input[name="email"]').fill('race-' + Date.now() + '@example.com').catch(() => {});
  await shipping.locator('input[name="firstname"]').fill('Jan').catch(() => {});
  await shipping.locator('input[name="lastname"]').fill('Test').catch(() => {});
  await shipping.locator('input[name="street[0]"]').fill('Testowa 1').catch(() => {});
  await shipping.locator('input[name="city"]').fill('Warszawa').catch(() => {});
  await shipping.locator('input[name="postcode"]').fill('00-001').catch(() => {});
  await shipping.locator('input[name="telephone"]').fill('500600700').catch(() => {});
  await shipping.locator('input[name="telephone"]').blur().catch(() => {});

  await page.waitForFunction(() => document.querySelectorAll('input[name="shipping_method"]:not(:disabled)').length > 0, null, { timeout: 30000 });

  // Rapidly select first shipping then first payment multiple times to provoke race
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const ship = document.querySelector('input[name="shipping_method"]:not(:disabled)');
      if (ship) {
        ship.checked = true;
        ship.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.fastcheckoutHyvaShipping?.syncShippingMethod) {
          window.fastcheckoutHyvaShipping.rememberUserShippingSelection?.(ship.value);
          window.fastcheckoutHyvaShipping.syncShippingMethod(ship.value);
          window.fastcheckoutHyvaShipping.persistShippingMethodNow?.(ship.value);
        }
      }
    });
    // Intentionally tight window: payment while set-shipping-information is in flight
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const pay = document.querySelector('input[name="payment_method"]:not(:disabled)');
      if (pay) {
        pay.checked = true;
        pay.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.fastcheckoutHyvaPayment?.selectPaymentMethod) {
          window.fastcheckoutHyvaPayment.rememberUserPaymentSelection?.(pay.value);
          window.fastcheckoutHyvaPayment.selectPaymentMethod(pay.value);
        }
      }
    });
    await page.waitForTimeout(400);
  }

  await page.waitForTimeout(2500);
  expect(paymentErrors, paymentErrors.join('\n')).toEqual([]);
});

test('early payment select before full address does not POST missing-shipping error', async ({ page }) => {
  test.setTimeout(120000);
  const paymentErrors = [];
  page.on('response', async (response) => {
    if (response.request().method() !== 'POST') return;
    if (!/set-payment-information|payment-information/i.test(response.url())) return;
    if (response.status() < 400) return;
    let body = '';
    try { body = await response.text(); } catch (e) {}
    if (/shipping address is missing|Brak adresu wysyłki/i.test(body)) {
      paymentErrors.push(response.status() + ' ' + response.url() + ' ' + body.slice(0, 200));
    }
  });

  await openCheckout(page);

  // Country only — often enough for rates/default shipping but not for a full
  // set-shipping-information, which used to race sole-payment auto-select.
  const shipping = page.locator('.fastcheckout-native-shipping-address');
  await shipping.locator('select[name="country_id"]').selectOption('PL').catch(() => {});
  await page.waitForTimeout(1200);

  // Hammer payment selection if any radios are already visible
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const pay = document.querySelector('input[name="payment_method"]:not(:disabled)');
      if (pay) {
        pay.checked = true;
        pay.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.fastcheckoutHyvaPayment?.selectPaymentMethod) {
          window.fastcheckoutHyvaPayment.rememberUserPaymentSelection?.(pay.value);
          window.fastcheckoutHyvaPayment.selectPaymentMethod(pay.value);
        }
      }
      const ship = document.querySelector('input[name="shipping_method"]:not(:disabled)');
      if (ship && window.fastcheckoutHyvaShipping?.persistShippingMethodNow) {
        ship.checked = true;
        window.fastcheckoutHyvaShipping.rememberUserShippingSelection?.(ship.value);
        window.fastcheckoutHyvaShipping.persistShippingMethodNow(ship.value);
      }
    });
    await page.waitForTimeout(200);
  }

  await page.waitForTimeout(1500);
  expect(paymentErrors, paymentErrors.join('\n')).toEqual([]);
});
