import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';

async function openCheckoutWithProduct(page) {
    await page.goto(BASE + 'rma-e2e-product.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await page.locator('#product-addtocart-button').click();
    await page.waitForTimeout(1500);
    await page.goto(BASE + 'fast-checkout/?validation=' + Date.now(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await expect(page.locator('#fastcheckout-checkout')).toBeVisible({ timeout: 45_000 });
    await page.waitForFunction(() => typeof window.require === 'function', null, {
        timeout: 30_000
    });
    await expect(
        page.locator('.fastcheckout-native-shipping-address select[name="country_id"]')
    ).toBeVisible({ timeout: 30_000 });
}

async function fillPolishShippingAddress(page) {
    const shipping = page.locator('.fastcheckout-native-shipping-address');

    await shipping.locator('input[name="email"]').fill(
        'validation-' + Date.now() + '@example.com'
    );
    await shipping.locator('input[name="firstname"]').fill('Jan');
    await shipping.locator('input[name="lastname"]').fill('Testowy');
    await shipping.locator('input[name="street[0]"]').fill('Testowa 1');
    await shipping.locator('input[name="city"]').fill('Warszawa');
    await shipping.locator('input[name="postcode"]').fill('00-001');
    await shipping.locator('input[name="telephone"]').fill('500600700');
    await shipping.locator('select[name="country_id"]').selectOption('PL');

    const region = shipping.locator('select[name="region_id"]');
    await expect(region).toBeVisible();
    await expect.poll(async () => (
        region.locator('option:not([value=""])').count()
    )).toBeGreaterThan(0);
    await region.selectOption({ index: 1 });
    await shipping.locator('input[name="telephone"]').blur();
}

test.describe('Fastcheckout country and payment validation regressions', () => {
    test('country change never sends an empty string as region_id', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shipping = page.locator('.fastcheckout-native-shipping-address');
        const responsePromise = page.waitForResponse((response) => {
            if (
                response.request().method() !== 'POST' ||
                !response.url().includes('/estimate-shipping-methods')
            ) {
                return false;
            }

            try {
                const payload = response.request().postDataJSON();
                const address = payload && payload.address;

                return address && (address.country_id || address.countryId) === 'DE';
            } catch (error) {
                return false;
            }
        }, { timeout: 30_000 });

        await shipping.locator('select[name="country_id"]').selectOption('DE');
        const response = await responsePromise;
        const payload = response.request().postDataJSON();
        const regionId = payload.address.region_id;

        expect(regionId).not.toBe('');
        expect(regionId == null || Number.isInteger(regionId)).toBe(true);
        expect(response.status(), await response.text()).toBeLessThan(400);

        // Reproduce the original race explicitly: the quote already carries a PL
        // region while the newly selected country is DE.
        const staleRegionResponsePromise = page.waitForResponse((candidate) => {
            if (
                candidate.request().method() !== 'POST' ||
                !candidate.url().includes('/estimate-shipping-methods')
            ) {
                return false;
            }

            try {
                const candidateAddress = candidate.request().postDataJSON().address;

                return candidateAddress &&
                    candidateAddress.country_id === 'DE' &&
                    candidateAddress.city === 'Region Guard Race';
            } catch (error) {
                return false;
            }
        }, { timeout: 30_000 });

        await page.evaluate(() => new Promise((resolve, reject) => {
            window.require([
                'Magento_Checkout/js/model/address-converter',
                'Magento_Checkout/js/model/shipping-rate-processor/new-address'
            ], (converter, processor) => {
                try {
                    const address = converter.formAddressDataToQuoteAddress({
                        firstname: 'Jan',
                        lastname: 'Testowy',
                        street: { 0: 'Testowa 1' },
                        city: 'Region Guard Race',
                        postcode: '10115',
                        country_id: 'DE',
                        region_id: '1024',
                        region: 'mazowieckie',
                        telephone: '500600700'
                    });

                    processor.getRates(address);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, reject);
        }));

        const staleRegionResponse = await staleRegionResponsePromise;
        const staleRegionPayload = staleRegionResponse.request().postDataJSON();

        expect(staleRegionPayload.address.region_id).toBeUndefined();
        expect(staleRegionResponse.status(), await staleRegionResponse.text()).toBeLessThan(400);
    });

    test('main checkout submit validates an empty purchase order number', async ({ page }) => {
        let orderRequests = 0;
        let captureSubmitRequests = false;
        const submitRequests = [];

        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/V1\/guest-carts\/[^/]+\/(?:payment-information|order)(?:\?|$)/.test(request.url())
            ) {
                orderRequests += 1;
            }
            if (
                captureSubmitRequests &&
                request.method() === 'POST' &&
                /\/V1\/guest-carts\/[^/]+\/(?:shipping-information|payment-information|order)(?:\?|$)/.test(request.url())
            ) {
                submitRequests.push(request.url());
            }
        });

        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());

        const purchaseOrder = page.locator(
            'input[name="payment_method"][value="purchaseorder"]:visible:not(:disabled)'
        );
        await expect(purchaseOrder).toBeVisible({ timeout: 30_000 });
        await purchaseOrder.evaluate((input) => input.click());

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="purchaseorder"]'
        );
        const poNumber = target.locator('input[name="payment[po_number]"]:visible');
        await expect(poNumber).toBeVisible();
        await poNumber.fill('');
        await poNumber.focus();
        await poNumber.evaluate((input) => input.blur());

        await expect(poNumber).toHaveAttribute('aria-invalid', 'true');
        await poNumber.fill('PO-VALIDATION-CLEAR');
        await expect(poNumber).toHaveAttribute('aria-invalid', 'false');
        await poNumber.fill('');

        await page.evaluate(() => {
            window.fastcheckoutTestProcessingStarted = document.body.classList.contains(
                'checkout-submitting'
            );
            window.fastcheckoutTestProcessingObserver = new MutationObserver(() => {
                if (document.body.classList.contains('checkout-submitting')) {
                    window.fastcheckoutTestProcessingStarted = true;
                }
            });
            window.fastcheckoutTestProcessingObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        });
        captureSubmitRequests = true;
        await page.locator('[data-fastcheckout-place-order]:visible').evaluate(
            (button) => button.click()
        );

        await expect(poNumber).toHaveAttribute('aria-invalid', 'true');
        const errorId = await poNumber.getAttribute('aria-describedby');
        expect(errorId).toBeTruthy();
        await expect(target.locator('#' + errorId)).toBeVisible();
        await expect(target.locator('#' + errorId)).not.toHaveText('');
        await expect(
            page.locator('[data-fastcheckout-client-order-error]:not(.hidden)')
        ).toHaveCount(0);
        expect(await page.evaluate(() => {
            window.fastcheckoutTestProcessingObserver.disconnect();

            return window.fastcheckoutTestProcessingStarted;
        })).toBe(false);
        expect(submitRequests).toEqual([]);
        expect(orderRequests).toBe(0);
    });

    test('valid purchase order number reaches Magento and places an order', async ({ page }) => {
        test.skip(
            process.env.FC_PLACE_REAL_ORDER !== '1',
            'Set FC_PLACE_REAL_ORDER=1 to create a real test order.'
        );

        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());

        const purchaseOrder = page.locator(
            'input[name="payment_method"][value="purchaseorder"]:visible:not(:disabled)'
        );
        await expect(purchaseOrder).toBeVisible({ timeout: 30_000 });
        await purchaseOrder.evaluate((input) => input.click());

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="purchaseorder"]'
        );
        const poNumber = target.locator('input[name="payment[po_number]"]:visible');
        const expectedPoNumber = 'FC-E2E-' + Date.now();

        await expect(poNumber).toBeVisible();
        await poNumber.fill(expectedPoNumber);
        await page.locator(
            '.checkout-agreement input[type="checkbox"], input[name*="agreement"]'
        ).evaluateAll((checkboxes) => {
            checkboxes.forEach((checkbox) => {
                if (!checkbox.checked) {
                    checkbox.click();
                }
            });
        });

        const orderResponsePromise = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            /\/V1\/guest-carts\/[^/]+\/payment-information(?:\?|$)/.test(response.url())
        ), { timeout: 60_000 });

        await page.locator('[data-fastcheckout-place-order]:visible').evaluate(
            (button) => button.click()
        );

        const orderResponse = await orderResponsePromise;
        const requestPayload = orderResponse.request().postDataJSON();

        expect(requestPayload.paymentMethod.method).toBe('purchaseorder');
        expect(requestPayload.paymentMethod.po_number).toBe(expectedPoNumber);
        expect(orderResponse.status(), await orderResponse.text()).toBeLessThan(400);

        const orderEntityId = JSON.parse(await orderResponse.text());
        expect(Number(orderEntityId)).toBeGreaterThan(0);
        await page.waitForURL(/checkout\/onepage\/success/, { timeout: 30_000 });
        console.log('Created Purchase Order test order entity ID:', orderEntityId);
    });
});
