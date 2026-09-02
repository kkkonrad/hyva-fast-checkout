import {test, expect} from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'aim-analog-watch.html';
const TWO_STEP = process.env.FC_EXPECT_TWO_STEP === '1';
const PLACE_ORDER = process.env.FC_ALLOW_PLACE_ORDER === '1';
const REQUIRED_COMPONENTS = [
    'checkoutProvider',
    'checkout.steps.shipping-step.shippingAddress',
    'checkout.steps.billing-step.payment',
    'checkout.steps.billing-step.payment.payments-list',
    'checkout.sidebar',
    'checkout.sidebar.summary',
    'checkout.sidebar.shipping-information'
];

async function dismissConsent(page) {
    const button = page.getByRole('button', {
        name: /Odrzuć opcjonalne|Reject optional|Reject all/i
    }).first();

    if (await button.isVisible({timeout: 3_000}).catch(() => false)) {
        await button.click({force: true});
    }
}

async function openCheckout(page) {
    await page.addInitScript(() => {
        window.addEventListener('fastcheckout:ready', () => {
            document.documentElement.dataset.fastcheckoutReady = '1';
        });
    });
    await page.goto(new URL(PRODUCT, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await dismissConsent(page);
    const add = page.getByRole('button', {
        name: /Dodaj do koszyka|Add to Cart/i
    });
    await expect(add).toBeVisible({timeout: 30_000});
    const added = page.waitForResponse((response) => (
        response.request().method() === 'POST' && response.url().includes('/checkout/cart/add/')
    ), {timeout: 30_000});
    await add.click();
    expect((await added).status()).toBeLessThan(400);
    await page.goto(new URL(`checkout/?compat=${Date.now()}`, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await dismissConsent(page);
    await expect(page.locator('#checkout > #fastcheckout-checkout'))
        .toBeVisible({timeout: 45_000});
    await page.waitForFunction(() => (
        document.documentElement.dataset.fastcheckoutReady === '1'
    ), null, {timeout: 45_000});
    await expect.poll(() => page.evaluate((components) => {
        if (!window.require?.defined?.('uiRegistry')) {
            return components;
        }

        const registry = window.require('uiRegistry');

        return components.filter((name) => !registry.get(name));
    }, REQUIRED_COMPONENTS), {timeout: 45_000}).toEqual([]);
}

async function fillShippingAddress(page, prefix) {
    const root = page.locator('.fastcheckout-native-shipping-address');

    await expect(root.locator('input[name="firstname"]')).toBeVisible({timeout: 45_000});
    await root.locator('input[name="username"]')
        .fill(`${prefix}-${Date.now()}@example.com`);

    const country = root.locator('select[name="country_id"]');
    if (await country.isVisible()) {
        await country.selectOption('PL');
    }

    const region = root.locator('select[name="region_id"]');
    if (await region.isVisible()) {
        await expect.poll(() => region.locator('option').count(), {timeout: 15_000})
            .toBeGreaterThan(1);
        const value = await region.locator('option').evaluateAll((options) => (
            options.map((option) => option.value).find(Boolean)
        ));
        await region.selectOption(value);
    }

    for (const [name, value] of [
        ['firstname', 'Jan'],
        ['lastname', 'Kowalski'],
        ['street[0]', 'Testowa 1'],
        ['city', 'Warszawa'],
        ['postcode', '00-001'],
        ['telephone', '500600700']
    ]) {
        await root.locator(`input[name="${name}"]`).fill(value);
    }

    await expect.poll(() => page.evaluate(() => (
        window.require('Magento_Checkout/js/model/shipping-service').isLoading()
    )), {timeout: 45_000}).toBe(false);
}

async function shippingRates(page) {
    const rates = page.locator(
        '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
    );

    await expect.poll(() => rates.count(), {timeout: 45_000}).toBeGreaterThan(0);
    return rates;
}

async function chooseRegularShipping(page) {
    const rates = await shippingRates(page);
    const index = await rates.evaluateAll((inputs) => {
        const preferred = inputs.findIndex((input) => input.value === 'tablerate_bestway');

        return preferred >= 0 ? preferred : Math.max(0, inputs.findIndex((input) => (
            !/(?:inpost|locker|pickup)/i.test(input.value)
        )));
    });

    await rates.nth(index).click({force: true});
}

async function paymentMethods(page) {
    const methods = page.locator('#checkout-payment-method-load .payment-method');

    await expect.poll(() => methods.count(), {timeout: 45_000}).toBeGreaterThan(0);
}

function visibleFieldError(field) {
    return field.locator(
        'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field ")][1]' +
        '//*[contains(@class, "mage-error") or contains(@class, "field-error")]'
    ).first();
}

test.describe('Fastcheckout one-step compatibility host', () => {
    test.skip(TWO_STEP, 'Run the dedicated two-step contract instead.');

    test('keeps Magento component, DOM and renderer extension points', async ({page}) => {
        test.setTimeout(150_000);
        const failedAssets = [];

        page.on('response', (response) => {
            if (response.status() >= 400 &&
                new URL(response.url()).origin === new URL(BASE).origin &&
                /\.(?:js|html)(?:\?|$)/i.test(response.url())) {
                failedAssets.push(`${response.status()} ${response.url()}`);
            }
        });
        await openCheckout(page);

        const contract = await page.evaluate((components) => {
            const registry = window.require('uiRegistry');
            const shipping = registry.get('checkout.steps.shipping-step.shippingAddress');
            const payment = registry.get('checkout.steps.billing-step.payment');

            return {
                components: components.every((name) => registry.get(name)),
                regions: [
                    [shipping, 'shippingAdditional'],
                    [shipping, 'before-shipping-method-form'],
                    [payment, 'beforeMethods'],
                    [payment, 'afterMethods']
                ].every(([component, region]) => (
                    component && typeof component.getRegion(region) === 'function'
                )),
                templates: Boolean(
                    shipping?.shippingMethodListTemplate &&
                    shipping?.shippingMethodItemTemplate
                ),
                dom: [
                    '#checkout[data-bind*="checkout"]',
                    '#shipping',
                    '#checkout-step-shipping[data-role="content"]',
                    '#opc-shipping_method',
                    '#checkout-step-shipping_method[data-role="content"]',
                    '#co-shipping-method-form',
                    '#payment',
                    '#checkout-step-payment[data-role="content"]',
                    '#co-payment-form',
                    '#onepage-checkout-shipping-method-additional-load'
                ].every((selector) => document.querySelector(selector)),
                noFallbackAssets: !Array.from(document.querySelectorAll('link[href], script[src]'))
                    .some((node) => /\/Magento\/(?:blank|luma)\//.test(node.href || node.src || ''))
            };
        }, REQUIRED_COMPONENTS);

        expect(contract).toEqual({
            components: true,
            regions: true,
            templates: true,
            dom: true,
            noFallbackAssets: true
        });
        await expect(page.locator('[data-fastcheckout-startup-loader]')).toHaveCount(0);
        await expect(page.locator('[data-fastcheckout-section-loader]')).toHaveCount(4);
        await expect.poll(() => page.locator('[data-fastcheckout-section-loader]').evaluateAll(
            (loaders) => loaders.every((loader) => loader.hidden)
        )).toBe(true);
        await expect(page.locator('[data-fastcheckout-native-summary] .product-item'))
            .toBeVisible();
        await expect(page.locator('[data-fastcheckout-place-order-ssr]')).toBeEnabled();

        const rendererCount = await page.evaluate(() => new Promise((resolve, reject) => {
            window.require([
                'Magento_Checkout/js/model/payment/renderer-list'
            ], (renderers) => resolve(renderers().length), reject);
        }));
        expect(rendererCount).toBeGreaterThan(0);

        await page.setViewportSize({width: 390, height: 844});
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeEnabled();
        await expect(page.locator('[data-fastcheckout-next-step-mobile]')).toHaveCount(0);
        expect(failedAssets, failedAssets.join('\n')).toEqual([]);
    });

    test('validates address, shipping and native payment in that order', async ({page}) => {
        test.setTimeout(180_000);
        const requests = [];

        page.on('request', (request) => {
            if (request.method() === 'POST' &&
                /\/(?:shipping-information|payment-information)(?:\?|$)/.test(request.url())) {
                requests.push(request.url());
            }
        });
        await openCheckout(page);

        const placeOrder = page.locator('[data-fastcheckout-place-order-ssr]');
        const firstName = page.locator(
            '.fastcheckout-native-shipping-address input[name="firstname"]'
        );
        const shippingError = page.locator('[data-fastcheckout-shipping-method-error]');

        await placeOrder.click({force: true});
        await expect(firstName).toHaveAttribute('aria-invalid', 'true');
        await expect(shippingError).toBeHidden();
        expect(requests).toEqual([]);

        await fillShippingAddress(page, 'compat');
        await shippingRates(page);
        await placeOrder.click({force: true});
        await expect(shippingError).toBeVisible();
        await expect(shippingError).toBeInViewport();
        expect(requests).toEqual([]);

        await chooseRegularShipping(page);
        await paymentMethods(page);
        await expect(shippingError).toBeHidden();

        const purchaseOrder = page.locator(
            'input[name="payment[method]"][value="purchaseorder"]'
        );
        if (!await purchaseOrder.count()) {
            expect(PLACE_ORDER).toBe(false);
            return;
        }

        await purchaseOrder.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
        ))).toBe('purchaseorder');

        const sameAsShipping = page.locator(
            '.payment-method._active input[name="billing-address-same-as-shipping"], ' +
            '.fastcheckout-payment-after-methods ' +
            'input[name="billing-address-same-as-shipping"]'
        ).first();
        await expect(sameAsShipping).toBeChecked();

        const poNumber = page.locator('input[name="payment[po_number]"]');
        await expect(poNumber).toBeVisible();
        await placeOrder.click({force: true});
        await expect(visibleFieldError(poNumber)).toBeVisible();
        await expect(visibleFieldError(poNumber)).toBeInViewport();

        await poNumber.fill(`FC-E2E-${Date.now()}`);
        await poNumber.blur();
        await expect(visibleFieldError(poNumber)).toBeHidden();

        if (!PLACE_ORDER) {
            return;
        }

        const requiredAgreements = page.locator(
            '[data-fastcheckout-agreements-summary-host] ' +
            'input[type="checkbox"][name^="agreement["]:not(:disabled)'
        );
        for (let index = 0; index < await requiredAgreements.count(); index += 1) {
            const agreement = requiredAgreements.nth(index);
            if (!await agreement.isChecked()) {
                await agreement.check({force: true});
            }
        }

        requests.length = 0;
        const response = page.waitForResponse((candidate) => (
            candidate.request().method() === 'POST' &&
            /\/payment-information(?:\?|$)/.test(candidate.url())
        ), {timeout: 60_000});
        await placeOrder.click({force: true});
        expect((await response).ok()).toBe(true);
        await page.waitForURL(/checkout\/onepage\/success/, {timeout: 60_000});
        await expect(page.locator('.fastcheckout-success-card')).toBeVisible();
        expect(requests.filter((url) => url.includes('/shipping-information')))
            .toHaveLength(0);
        expect(requests.filter((url) => /\/payment-information(?:\?|$)/.test(url)))
            .toHaveLength(1);
    });
});

test.describe('Fastcheckout Magento two-step flow', () => {
    test.skip(!TWO_STEP, 'Enable with FC_EXPECT_TWO_STEP=1.');

    test('uses native shipping validation, save and step navigation', async ({page}) => {
        test.setTimeout(180_000);
        let shippingRequests = 0;

        page.on('request', (request) => {
            if (request.method() === 'POST' && request.url().includes('/shipping-information')) {
                shippingRequests += 1;
            }
        });
        await openCheckout(page);

        const root = page.locator('#fastcheckout-checkout');
        const shippingStep = page.locator('[data-fastcheckout-shipping-step]');
        const paymentStep = page.locator('[data-fastcheckout-payment-step]');
        const next = page.locator('[data-fastcheckout-next-step]');
        const firstName = page.locator(
            '.fastcheckout-native-shipping-address input[name="firstname"]'
        );
        const shippingError = page.locator('[data-fastcheckout-shipping-method-error]');

        await expect(root).toHaveAttribute('data-fastcheckout-mode', 'two-step');
        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'shipping');
        await expect(page.locator('.fastcheckout-progress .opc-progress-bar')).toBeVisible();
        await expect(shippingStep).toBeVisible();
        await expect(paymentStep).toBeHidden();

        await next.click({force: true});
        await expect(firstName).toHaveAttribute('aria-invalid', 'true');
        await expect(shippingError).toBeHidden();
        expect(shippingRequests).toBe(0);

        await fillShippingAddress(page, 'two-step');
        await shippingRates(page);
        await next.click({force: true});
        await expect(shippingError).toBeVisible();
        await expect(shippingError).toBeInViewport();
        expect(shippingRequests).toBe(0);

        await chooseRegularShipping(page);
        await expect(shippingError).toBeHidden();
        const shippingResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), {timeout: 60_000});
        await next.click({force: true});
        expect((await shippingResponse).ok()).toBe(true);
        expect(shippingRequests).toBe(1);

        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'payment');
        await expect(shippingStep).toBeHidden();
        await expect(paymentStep).toBeVisible();
        await expect(page.locator('[data-fastcheckout-shipping-information]'))
            .toBeVisible();
        await paymentMethods(page);
        await expect(page.locator('[data-fastcheckout-place-order-ssr]')).toBeVisible();

        await page.locator('.fastcheckout-progress .opc-progress-bar-item._complete > span')
            .first().click();
        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'shipping');
        await expect(shippingStep).toBeVisible();
        await expect(paymentStep).toBeHidden();
    });
});
