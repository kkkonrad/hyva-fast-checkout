import { test, expect } from '@playwright/test';

const BASE = process.env.FC_PAYU_BASE_URL || 'https://m10625.app-on-demand.net/';
const PRODUCT_PATH = process.env.FC_PAYU_PRODUCT_PATH || 'aim-analog-watch.html';

async function openCheckoutWithProduct(page) {
    await page.goto(new URL(PRODUCT_PATH, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    const addToCart = page.getByRole('button', { name: /Dodaj do koszyka|Add to Cart/i });
    await expect(addToCart).toBeVisible();
    await Promise.all([
        page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/checkout/cart/add')
        )),
        addToCart.click()
    ]);

    await page.goto(new URL('checkout/?payu=' + Date.now(), BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await expect(page.locator('#fastcheckout-checkout')).toBeVisible({ timeout: 45_000 });
}

async function fillShippingAddress(page) {
    const shipping = page.locator('.fastcheckout-native-shipping-address');

    await expect(shipping.locator('input[name="email"]')).toBeVisible({ timeout: 45_000 });
    await shipping.locator('input[name="email"]').fill('payu-' + Date.now() + '@example.com');
    await shipping.locator('input[name="firstname"]').fill('Jan');
    await shipping.locator('input[name="lastname"]').fill('Testowy');
    await shipping.locator('input[name="street[0]"]').fill('Testowa 1');
    await shipping.locator('input[name="city"]').fill('Warszawa');
    await shipping.locator('input[name="postcode"]').fill('00-001');
    await shipping.locator('input[name="telephone"]').fill('500600700');
    await shipping.locator('select[name="country_id"]').selectOption('PL');

    const region = shipping.locator('select[name="region_id"]');
    await expect.poll(() => region.locator('option:not([value=""])').count()).toBeGreaterThan(0);
    await region.selectOption({ index: 1 });
    await shipping.locator('input[name="telephone"]').blur();
}

async function exposePayuCards(page) {
    const findPayuCode = () => page.locator('input[name="payment_method"]')
        .evaluateAll((inputs) => inputs.find((input) => (
            /payu.*card|card.*payu/i.test(input.value)
        ))?.value || '');

    await expect.poll(findPayuCode, { timeout: 30_000 }).toMatch(/payu/i);
    const payuCode = await findPayuCode();
    const payuInput = page.locator('input[name="payment_method"][value="' + payuCode + '"]');
    const shippingMethods = page.locator('input[name="shipping_method"]');
    const findShippingCode = () => shippingMethods.evaluateAll((inputs) => (
        inputs.find((input) => (
            input.checked && !input.disabled && input.offsetParent !== null
        ))?.value || ''
    ));

    await expect.poll(() => shippingMethods.evaluateAll((inputs) => (
        inputs.filter((input) => !input.disabled && input.offsetParent !== null).length
    )), { timeout: 30_000 }).toBeGreaterThan(0);
    const shippingCode = await findShippingCode() || await shippingMethods.evaluateAll((inputs) => {
        const available = inputs.filter((input) => (
            !input.disabled && input.offsetParent !== null
        ));

        return available[available.length - 1].value;
    });

    const shippingResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST' &&
        response.url().includes('/shipping-information')
    ), { timeout: 20_000 }).catch(() => null);
    await page.evaluate(async (methodCode) => {
        const bridge = window.fastcheckoutHyvaShipping;
        const input = Array.from(document.querySelectorAll('input[name="shipping_method"]'))
            .find((element) => element.value === methodCode && element.offsetParent !== null);

        input.checked = true;
        bridge.rememberUserShippingSelection(methodCode);
        bridge.syncShippingMethod(methodCode);
        await Promise.resolve(bridge.persistShippingMethodNow(methodCode));
    }, shippingCode);
    await shippingResponse;

    if (await payuInput.isDisabled()) {
        await page.evaluate(({ methodCode, selectedShippingCode }) => {
            const settings = window.checkoutConfig?.fastcheckoutSettings || {};
            const rules = Array.isArray(settings.shippingPaymentMapping)
                ? settings.shippingPaymentMapping
                : Object.values(settings.shippingPaymentMapping || {});

            if (!window.fastcheckoutHyvaShipping?.applyPaymentRemapForShipping) {
                throw new Error('PayU Cards has no usable shipping method.');
            }

            // The fixture maps PayU to a disabled carrier. Keep the override in
            // browser memory so submit follows the production validation path.
            settings.shippingPaymentMapping = rules.concat([{
                shipping_method: selectedShippingCode,
                payment_method: methodCode
            }]);
            window.fastcheckoutHyvaShipping.applyPaymentRemapForShipping(selectedShippingCode);
        }, { methodCode: payuCode, selectedShippingCode: shippingCode });
    }

    await expect(payuInput).toBeVisible();
    await expect(payuInput).toBeEnabled();

    return payuCode;
}

test.describe('PayU compatibility on Hyvä Fastcheckout', () => {
    test.skip(process.env.FC_PAYU_E2E !== '1', 'Set FC_PAYU_E2E=1 to test the PayU store.');

    test('secure card renderer blocks submit until ready and shows one inline error container', async ({ page }) => {
        test.setTimeout(180_000);
        const pageErrors = [];
        let orderRequests = 0;

        page.on('pageerror', (error) => pageErrors.push(String(error)));
        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/(?:payment-information|order)(?:[/?]|$)/.test(request.url())
            ) {
                orderRequests++;
            }
        });

        await openCheckoutWithProduct(page);
        await fillShippingAddress(page);
        const payuCode = await exposePayuCards(page);
        const payuInput = page.locator('input[name="payment_method"][value="' + payuCode + '"]');
        await payuInput.evaluate((input) => input.click());
        await page.evaluate((methodCode) => {
            window.fastcheckoutHyvaPayment.rememberUserPaymentSelection(methodCode);
            window.fastcheckoutHyvaPayment.selectPaymentMethod(methodCode);
        }, payuCode);
        await expect(payuInput).toBeChecked();

        const readiness = await page.evaluate((methodCode) => new Promise((resolve) => {
            const startedAt = Date.now();
            let sawPending = false;
            let submitEnabledWhilePending = false;
            const timer = window.setInterval(() => {
                const bridge = window.fastcheckoutHyvaPayment;
                const ready = Boolean(
                    bridge &&
                    typeof bridge.isRendererReady === 'function' &&
                    bridge.isRendererReady(methodCode)
                );

                if (!ready) {
                    sawPending = true;
                    document.querySelectorAll(
                        '[data-fastcheckout-place-order], [data-fastcheckout-place-order-mobile]'
                    ).forEach((button) => {
                        if (!button.disabled) {
                            submitEnabledWhilePending = true;
                        }
                    });
                }

                if (ready || Date.now() - startedAt > 60_000) {
                    window.clearInterval(timer);
                    resolve({ ready, sawPending, submitEnabledWhilePending });
                }
            }, 25);
        }), payuCode);

        expect(readiness.ready, JSON.stringify(readiness)).toBe(true);
        expect(readiness.submitEnabledWhilePending, JSON.stringify(readiness)).toBe(false);
        await expect(payuInput).toBeChecked();

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="' + payuCode + '"]'
        );
        await expect(target).toBeVisible();
        await expect(target.locator('.payment-method')).toBeVisible();

        const placeOrder = page.locator(
            '[data-fastcheckout-place-order], [data-fastcheckout-place-order-mobile]'
        ).filter({ visible: true });
        await expect(placeOrder).toHaveCount(1);
        await placeOrder.evaluate((button) => button.click());
        await expect.poll(() => target.locator('.payu-msg').evaluateAll((messages) => (
            messages.filter((message) => message.offsetParent !== null).length
        )), { timeout: 30_000 }).toBe(1);
        await expect.poll(() => target.locator('.msg__error').evaluateAll((messages) => (
            messages.filter((message) => message.offsetParent !== null && message.textContent.trim()).length
        ))).toBeGreaterThan(0);
        await expect.poll(() => page.locator('[data-fastcheckout-client-order-error]').evaluateAll((messages) => (
            messages.filter((message) => message.offsetParent !== null && message.textContent.trim()).length
        ))).toBe(0);

        expect(orderRequests).toBe(0);
        expect(pageErrors).toEqual([]);
    });
});
