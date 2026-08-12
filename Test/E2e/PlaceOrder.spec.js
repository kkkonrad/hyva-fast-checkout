import {test, expect} from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'aim-analog-watch.html';

async function dismissConsent(page) {
    const button = page.getByRole('button', {
        name: /Odrzuć opcjonalne|Reject optional|Reject all/i
    }).first();

    if (await button.isVisible({timeout: 3_000}).catch(() => false)) {
        await button.click({force: true});
        await button.waitFor({state: 'hidden', timeout: 5_000}).catch(() => {});
    }
}

test('places a guest Purchase Order on Fastcheckout', async ({page}) => {
    test.setTimeout(180_000);
    const pageErrors = [];
    const paymentUrls = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/payment-information')) {
            paymentUrls.push(request.url());
        }
    });

    await page.addInitScript(() => {
        if (window === window.top && /\/checkout(?:\/|$)/.test(location.pathname)) {
            ['mage-cache-storage', 'mage-cache-storage-section-invalidation']
                .forEach((key) => localStorage.setItem(key, 'null'));
        }
    });

    await page.goto(new URL(PRODUCT, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await dismissConsent(page);
    const add = page.getByRole('button', {name: /Dodaj do koszyka|Add to Cart/i});
    await expect(add).toBeVisible({timeout: 30_000});
    await add.click();
    await page.waitForTimeout(1_000);

    await page.goto(new URL('checkout/?place=' + Date.now(), BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await dismissConsent(page);
    await expect(page.locator('body')).toHaveClass(/fastcheckout-checkout-page/, {
        timeout: 30_000
    });
    await expect(page.locator('#checkout > #fastcheckout-checkout'))
        .toBeVisible({timeout: 45_000});
    await page.waitForFunction(() => (
        typeof window.require === 'function' &&
        window.require.defined &&
        window.require.defined('uiRegistry')
    ), null, {timeout: 45_000});

    const shippingRoot = page.locator('.fastcheckout-native-shipping-address');
    await expect(shippingRoot.locator('input[name="firstname"]'))
        .toBeVisible({timeout: 45_000});

    await shippingRoot.locator('input[name="username"]').fill(
        'place-' + Date.now() + '@example.com'
    );
    const country = shippingRoot.locator('select[name="country_id"]');
    if (await country.isVisible()) {
        await country.selectOption('PL');
    }
    const region = shippingRoot.locator('select[name="region_id"]');
    if (await region.isVisible()) {
        await expect.poll(() => region.locator('option').count(), {timeout: 15_000})
            .toBeGreaterThan(1);
        const options = await region.locator('option').evaluateAll((items) =>
            items.map((item) => item.value).filter(Boolean)
        );
        await region.selectOption(options[0]);
    }
    for (const [name, value] of [
        ['firstname', 'Jan'],
        ['lastname', 'Kowalski'],
        ['street[0]', 'Testowa 1'],
        ['city', 'Warszawa'],
        ['postcode', '00-001'],
        ['telephone', '500600700']
    ]) {
        const field = shippingRoot.locator(`input[name="${name}"]`);
        await field.fill(value);
        await field.blur();
    }

    await expect.poll(() => page.evaluate(() => (
        window.require('Magento_Checkout/js/model/shipping-service').isLoading()
    )), {timeout: 45_000}).toBe(false);

    const tableRate = page.locator(
        '#fastcheckout-ko-shipping-root input[name="shipping_method"][value="tablerate_bestway"]'
    );
    const anyRate = page.locator('#fastcheckout-ko-shipping-root input[name="shipping_method"]');
    await expect.poll(() => anyRate.count(), {timeout: 45_000}).toBeGreaterThan(0);
    if (await tableRate.count()) {
        if (!await tableRate.isChecked()) {
            const shippingResponse = page.waitForResponse((response) => (
                response.request().method() === 'POST' &&
                response.url().includes('/shipping-information')
            ), {timeout: 45_000});
            await tableRate.click({force: true});
            expect((await shippingResponse).ok()).toBe(true);
        }
    } else {
        await anyRate.first().click({force: true});
    }

    await expect.poll(() => page.locator(
        '#checkout-payment-method-load .payment-method'
    ).count(), {timeout: 45_000}).toBeGreaterThan(0);

    const hostState = await page.evaluate(() => {
        const navigator = window.require('Magento_Checkout/js/model/step-navigator');
        const payment = window.require('uiRegistry').get('checkout.steps.billing-step.payment');
        const mixins = window.require.s.contexts._.config.config.mixins || {};

        return {
            shippingProcessed: navigator.isProcessed('shipping'),
            paymentVisible: Boolean(payment && payment.isVisible && payment.isVisible()),
            paymentMixin: Boolean(
                mixins['Magento_Checkout/js/view/payment'] &&
                mixins['Magento_Checkout/js/view/payment']
                    ['Kkkonrad_Fastcheckout/js/mixin/payment-visibility-mixin']
            ),
            extraSteps: Boolean(document.querySelector('[data-fastcheckout-extra-steps]'))
        };
    });
    expect(hostState).toEqual({
        shippingProcessed: true,
        paymentVisible: true,
        paymentMixin: true,
        extraSteps: true
    });

    const purchaseOrder = page.locator(
        'input[name="payment[method]"][value="purchaseorder"]'
    );
    await expect(purchaseOrder).toHaveCount(1);
    await purchaseOrder.evaluate((input) => input.click());
    await expect.poll(() => page.evaluate(() => (
        window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
    ))).toBe('purchaseorder');

    const poNumber = page.locator('input[name="payment[po_number]"]');
    await expect(poNumber).toBeVisible();
    await poNumber.fill('FC-PLACE-' + Date.now());
    await poNumber.blur();

    const agreements = page.locator(
        '.payment-method._active input[type="checkbox"][name^="agreement["]:not([disabled])'
    );
    const count = await agreements.count();
    for (let index = 0; index < count; index += 1) {
        await agreements.nth(index).check();
    }

    const proxy = page.locator('[data-fastcheckout-place-order-ssr]');
    await expect(proxy).toBeEnabled();
    const placeOrderResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST' &&
        response.url().includes('/payment-information')
    ), {timeout: 60_000});
    await proxy.click({force: true});
    const response = await placeOrderResponse;
    expect(response.status(), 'payment-information HTTP status').toBeLessThan(400);
    await page.waitForURL(/checkout\/onepage\/success/, {timeout: 60_000});
    await expect(page.locator('.fastcheckout-success-card')).toBeVisible();
    expect(paymentUrls).toHaveLength(1);
    expect(pageErrors.filter((message) => (
        message.includes('requirejs is not defined')
    ))).toEqual([]);
});
