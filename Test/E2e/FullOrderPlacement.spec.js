/**
 * Headless full guest order via Magento KO REST.
 * Covers same-as-shipping and separate billing.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const SCRATCH = process.env.FC_SCRATCH || '/tmp/grok-goal-2db32d4062a8/implementer';

async function addProductAndOpenCheckout(page) {
  await page.goto(BASE + 'rma-e2e-product.html', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const f = document.getElementById('product_addtocart_form');
    if (f?.requestSubmit) f.requestSubmit(); else f?.submit();
  });
  await page.waitForTimeout(2500);
  await page.goto(BASE + 'checkout/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#fastcheckout-checkout', { timeout: 45_000 });
  await page.waitForFunction(() => typeof window.require === 'function', null, { timeout: 30_000 });
  await page.waitForTimeout(4000);
}

function attachNetCapture(page) {
  const net = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (/shipping-information|payment-information|\/order(?:[?/]|$)/.test(u) && !u.includes('.js')) {
      let b = '';
      try { b = (await r.text()).slice(0, 500); } catch (e) { /* */ }
      net.push({ status: r.status(), url: u.replace(BASE, ''), body: b });
    }
  });
  return net;
}

/**
 * @param {'same'|'separate'} billingMode
 */
async function placeGuestOrder(page, billingMode) {
  const email = 'guest-order-' + Date.now() + '@example.com';

  return page.evaluate(async ({ email, billingMode }) => {
    const out = { steps: [], errors: [], billingMode };
    function step(s) { out.steps.push(s); }

    const load = (deps) => new Promise((resolve, reject) => {
      require(deps, (...mods) => resolve(mods), (err) => reject(err || new Error('require fail')));
    });

    try {
      const [
        conv, selectShip, selectBill, quote, checkoutData,
        selectShipMethod, shippingService, setShipInfo, placeOrder, selectPay
      ] = await load([
        'Magento_Checkout/js/model/address-converter',
        'Magento_Checkout/js/action/select-shipping-address',
        'Magento_Checkout/js/action/select-billing-address',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/checkout-data',
        'Magento_Checkout/js/action/select-shipping-method',
        'Magento_Checkout/js/model/shipping-service',
        'Magento_Checkout/js/action/set-shipping-information',
        'Magento_Checkout/js/action/place-order',
        'Magento_Checkout/js/action/select-payment-method'
      ]);
      step('modules-loaded');

      // PL requires regionId. 1024 = mazowieckie (Warszawa).
      const shippingData = {
        email,
        firstname: 'Jan',
        lastname: 'Kowalski',
        street: { 0: 'Testowa 1', 1: '' },
        city: 'Warszawa',
        postcode: '00-001',
        country_id: 'PL',
        region_id: '1024',
        region: 'mazowieckie',
        telephone: '500600700'
      };
      const billingData = billingMode === 'separate' ? {
        email,
        firstname: 'Anna',
        lastname: 'Nowak',
        street: { 0: 'Rozliczeniowa 9', 1: '' },
        city: 'Kraków',
        postcode: '30-001',
        country_id: 'PL',
        region_id: '1023',
        region: 'małopolskie',
        telephone: '501502503'
      } : shippingData;

      // Seed DOM email so place-order-mixin / customer-email-sync can find it.
      let emailEl = document.querySelector('input[name="email"], input[type="email"], #customer-email, #co-shipping-email');
      if (!emailEl) {
        emailEl = document.createElement('input');
        emailEl.type = 'email';
        emailEl.name = 'email';
        emailEl.id = 'co-shipping-email';
        emailEl.style.display = 'none';
        document.body.appendChild(emailEl);
      }
      emailEl.value = email;
      try { window.sessionStorage.setItem('fastcheckout_email', email); } catch (e) { /* */ }

      try {
        checkoutData.setShippingAddressFromData(shippingData);
        checkoutData.setBillingAddressFromData(billingData);
        if (typeof checkoutData.setValidatedEmailValue === 'function') {
          checkoutData.setValidatedEmailValue(email);
        }
        if (typeof checkoutData.setInputFieldEmailValue === 'function') {
          checkoutData.setInputFieldEmailValue(email);
        }
      } catch (e) { /* */ }

      const shipAddr = conv.formAddressDataToQuoteAddress(shippingData);
      const billAddr = conv.formAddressDataToQuoteAddress(billingData);
      selectShip(shipAddr);
      // Start exactly like the UI: billing follows shipping until the shopper
      // explicitly unchecks "same as shipping". Selecting a distinct billing
      // address before that click makes Magento uncheck the observable itself,
      // so no user-intent handler runs and the test no longer mirrors checkout.
      selectBill(quote.shippingAddress());
      // guestEmail is a plain string property on Magento quote model
      quote.guestEmail = email;
      step('address-set');

      await new Promise((r) => setTimeout(r, 2000));
      let rates = shippingService.getShippingRates()() || [];
      if (!rates.length && window.fastcheckoutInitialShippingRates) {
        shippingService.setShippingRates(window.fastcheckoutInitialShippingRates);
        rates = shippingService.getShippingRates()() || [];
      }
      out.rates = rates.map((r) => r.carrier_code + '_' + r.method_code);
      if (!rates.length) {
        out.errors.push('no rates');
        return out;
      }

      const rate = rates[0];
      selectShipMethod(rate);
      const radio = document.querySelector(
        'input[name="shipping_method"][value="' + rate.carrier_code + '_' + rate.method_code + '"]'
      );
      if (radio) radio.click();
      if (window.fastcheckoutHyvaShipping?.applyPaymentRemapForShipping) {
        window.fastcheckoutHyvaShipping.applyPaymentRemapForShipping(
          rate.carrier_code + '_' + rate.method_code
        );
      }
      step('shipping-selected:' + rate.carrier_code + '_' + rate.method_code);

      try {
        await new Promise((resolve, reject) => {
          const p = setShipInfo();
          if (p && typeof p.done === 'function') {
            p.done(resolve).fail(reject);
          } else {
            Promise.resolve(p).then(resolve, reject);
          }
        });
        step('shipping-information-ok');
      } catch (e) {
        out.errors.push('shipping-information: ' + (e && e.message || e));
        step('shipping-information-fail');
      }

      await new Promise((r) => setTimeout(r, 1000));

      let payCode = null;
      const allowed = document.querySelector(
        '[data-fastcheckout-payment-option][data-fastcheckout-payment-allowed="1"] input'
      );
      if (allowed) {
        allowed.disabled = false;
        allowed.click();
        payCode = allowed.value;
      } else {
        payCode = 'banktransfer';
        selectPay({ method: payCode });
      }
      if (quote.paymentMethod) quote.paymentMethod({ method: payCode });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // The billing component belongs to the active payment renderer. Mirror the
      // real interaction order: select payment, then toggle its billing checkbox.
      if (billingMode === 'separate') {
        const activeCheckbox = document.querySelector(
          '.payment-method._active input[name="billing-address-same-as-shipping"], ' +
          'input[name="billing-address-same-as-shipping"]:checked'
        );
        if (activeCheckbox?.checked) activeCheckbox.click();
        selectBill(billAddr);
      } else {
        selectBill(quote.shippingAddress());
      }
      quote.guestEmail = email;
      step('payment:' + payCode);

      document.querySelectorAll(
        '.checkout-agreement input[type="checkbox"], input[name*="agreement"]'
      ).forEach((c) => { if (!c.checked) c.click(); });

      const ship = quote.shippingAddress && quote.shippingAddress();
      const bill = quote.billingAddress && quote.billingAddress();
      out.quote = {
        email: quote.guestEmail,
        ship: ship && ship.firstname,
        shipRegion: ship && (ship.regionId || ship.region_id),
        sm: quote.shippingMethod() &&
          (quote.shippingMethod().carrier_code + '_' + quote.shippingMethod().method_code),
        pm: quote.paymentMethod() && quote.paymentMethod().method,
        bill: bill && bill.firstname,
        billRegion: bill && (bill.regionId || bill.region_id),
        sameName: !!(ship && bill && ship.firstname === bill.firstname)
      };

      try {
        const orderId = await new Promise((resolve, reject) => {
          const p = placeOrder({ method: payCode });
          if (p && typeof p.done === 'function') {
            p.done(resolve).fail((resp) => {
              const msg = resp && resp.responseJSON && resp.responseJSON.message
                ? resp.responseJSON.message
                : (resp && resp.statusText) || 'place-order fail';
              const params = resp && resp.responseJSON && resp.responseJSON.parameters
                ? ' ' + JSON.stringify(resp.responseJSON.parameters)
                : '';
              reject(new Error(msg + params));
            });
          } else {
            Promise.resolve(p).then(resolve, reject);
          }
        });
        out.orderId = orderId;
        out.success = true;
        step('order-ok:' + orderId);
      } catch (e) {
        out.success = false;
        out.errors.push('place-order: ' + (e && e.message || String(e)));
        step('order-fail');
      }

      if (!out.success && window.fastcheckoutHyvaPayment?.placeOrder) {
        try {
          quote.guestEmail = email;
          await window.fastcheckoutHyvaPayment.placeOrder(null, payCode);
          out.success = true;
          step('ui-place-ok');
        } catch (e2) {
          out.errors.push('ui-place: ' + (e2 && e2.message || e2));
        }
      }

      out.url = location.href;
      out.clientError = document.querySelector('[data-fastcheckout-client-order-error]')?.textContent?.trim() || '';
    } catch (e) {
      out.errors.push(String(e && e.message || e));
    }
    return out;
  }, { email, billingMode });
}

test('guest places order with same-as-shipping billing', async ({ page }) => {
  test.setTimeout(150_000);
  const net = attachNetCapture(page);
  await addProductAndOpenCheckout(page);
  const result = await placeGuestOrder(page, 'same');

  console.log('RESULT same', JSON.stringify(result, null, 2));
  console.log('NET same', JSON.stringify(net, null, 2));
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(SCRATCH + '/full-order-same.json', JSON.stringify({ result, net }, null, 2));
  } catch (e) { /* */ }

  expect(result.rates?.length, 'shipping rates').toBeGreaterThan(0);
  expect(result.quote?.sm, 'shipping method').toBeTruthy();
  expect(result.quote?.pm, 'payment method').toBeTruthy();
  const errText = (result.errors || []).join(' ') + ' ' + (result.clientError || '');
  expect(errText).not.toMatch(/nie rozpoczęła składania|did not start order placement|FastcheckoutSubscribe|is not supported/i);
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  expect(result.orderId || result.steps.some((s) => /^order-ok:/.test(s))).toBeTruthy();
});

test('guest places order with separate billing address', async ({ page }) => {
  test.setTimeout(150_000);
  const net = attachNetCapture(page);
  await addProductAndOpenCheckout(page);
  const result = await placeGuestOrder(page, 'separate');

  console.log('RESULT separate', JSON.stringify(result, null, 2));
  console.log('NET separate', JSON.stringify(net, null, 2));
  try {
    fs.mkdirSync(SCRATCH, { recursive: true });
    fs.writeFileSync(SCRATCH + '/full-order-separate.json', JSON.stringify({ result, net }, null, 2));
  } catch (e) { /* */ }

  expect(result.rates?.length, 'shipping rates').toBeGreaterThan(0);
  expect(result.quote?.sm, 'shipping method').toBeTruthy();
  expect(result.quote?.pm, 'payment method').toBeTruthy();
  expect(result.quote?.sameName, 'billing should differ from shipping').toBe(false);
  const errText = (result.errors || []).join(' ') + ' ' + (result.clientError || '');
  expect(errText).not.toMatch(/nie rozpoczęła składania|did not start order placement|FastcheckoutSubscribe|is not supported/i);
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
});
