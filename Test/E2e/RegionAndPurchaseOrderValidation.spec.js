import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';

async function openCheckoutWithProduct(page) {
    await page.goto(BASE + 'rma-e2e-product.html', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await page.locator('#product-addtocart-button').click();
    await page.waitForTimeout(1500);
    await page.goto(BASE + 'checkout/?validation=' + Date.now(), {
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
    test('payment filtering prompts for a shipping method first', async ({ page }) => {
        await openCheckoutWithProduct(page);

        const message = page.locator('[data-fastcheckout-no-payment-methods]');
        await expect(message).toBeVisible();
        await expect(message).toHaveText(
            'Aby zobaczyć dostępne metody płatności, wybierz metodę dostawy.'
        );
    });

    test('slow initial rate estimate does not block the restored shipping form', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
            window.require(['Magento_Checkout/js/checkout-data'], (checkoutData) => {
                const address = checkoutData.getShippingAddressFromData() || {};

                resolve(address.lastname || '');
            }, () => resolve(''));
        }))).toBe('Testowy');
        await page.waitForTimeout(500);
        await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
            window.require(['Magento_Checkout/js/model/shipping-service'], (service) => {
                resolve(!service.isLoading());
            }, () => resolve(false));
        }))).toBe(true);

        let releaseEstimate;
        let estimateBlocked = false;
        const estimatePayloads = [];

        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                request.url().includes('/estimate-shipping-methods')
            ) {
                estimatePayloads.push(request.postDataJSON());
            }
        });

        await page.addInitScript(() => {
            const originalOpen = XMLHttpRequest.prototype.open;

            window.fastcheckoutEstimateXhrModes = [];
            window.fastcheckoutEstimateFormStates = [];
            window.fastcheckoutShippingLoadingTransitions = [];
            XMLHttpRequest.prototype.open = function (method, url, async) {
                if (String(url || '').includes('/estimate-shipping-methods')) {
                    window.fastcheckoutEstimateXhrModes.push(
                        arguments.length < 3 ? true : async !== false
                    );
                    window.fastcheckoutEstimateFormStates.push(Boolean(
                        document.querySelector(
                            '.fastcheckout-native-shipping-address input[name="lastname"]'
                        )
                    ));
                }

                return originalOpen.apply(this, arguments);
            };

            (function subscribeToShippingLoading() {
                if (!window.require || !window.require.defined ||
                    !window.require.defined('Magento_Checkout/js/model/shipping-service')) {
                    window.setTimeout(subscribeToShippingLoading, 10);
                    return;
                }

                const service = window.require('Magento_Checkout/js/model/shipping-service');
                const record = (value) => {
                    const transitions = window.fastcheckoutShippingLoadingTransitions;
                    const normalized = Boolean(value);

                    if (!transitions.length || transitions[transitions.length - 1] !== normalized) {
                        transitions.push(normalized);
                    }
                };

                record(service.isLoading());
                service.isLoading.subscribe(record);
            }());
        });
        await page.route('**/estimate-shipping-methods', async (route) => {
            if (estimateBlocked) {
                await route.continue();
                return;
            }
            estimateBlocked = true;
            await new Promise((resolve) => {
                releaseEstimate = resolve;
            });
            await route.continue();
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect.poll(() => estimateBlocked, { timeout: 30_000 }).toBe(true);

        const shipping = page.locator('.fastcheckout-native-shipping-address');
        await expect(shipping.getByLabel('Nazwisko')).toBeVisible();
        await expect(shipping.getByLabel('Nazwisko')).toHaveValue('Testowy');
        expect(
            (await page.evaluate(() => window.fastcheckoutEstimateXhrModes)).every(Boolean),
            JSON.stringify(estimatePayloads, null, 2)
        ).toBe(true);
        expect(
            (await page.evaluate(() => window.fastcheckoutEstimateFormStates)).every(Boolean),
            JSON.stringify(estimatePayloads, null, 2)
        ).toBe(true);
        expect(estimatePayloads, JSON.stringify(estimatePayloads, null, 2)).toHaveLength(1);

        releaseEstimate();
        await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
            window.require(['Magento_Checkout/js/model/shipping-service'], (service) => {
                resolve(!service.isLoading());
            }, () => resolve(false));
        }))).toBe(true);
        expect(
            (await page.evaluate(() => window.fastcheckoutShippingLoadingTransitions))
                .filter(Boolean)
        ).toHaveLength(1);
    });

    test('slow payment renderer keeps place order disabled until it is ready', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        const shippingSelection = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), { timeout: 10_000 }).catch(() => null);
        await shippingMethod.evaluate((input) => input.click());
        await shippingSelection;

        const purchaseOrder = page.locator(
            'input[name="payment_method"][value="purchaseorder"]:visible:not(:disabled)'
        );
        await expect(purchaseOrder).toBeVisible({ timeout: 30_000 });
        await purchaseOrder.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutHyvaPayment.isRendererReady('purchaseorder')
        )), { timeout: 30_000 }).toBe(true);

        // SSR + mobile sticky always present; native Magento toolbar may also mount
        // with data-fastcheckout-place-order after renderer activation.
        const placeOrderButtons = page.locator(
            '[data-fastcheckout-place-order], [data-fastcheckout-place-order-mobile]'
        );
        await expect.poll(async () => placeOrderButtons.count()).toBeGreaterThanOrEqual(2);
        await page.evaluate(() => {
            const bridge = window.fastcheckoutHyvaPayment;

            window.fastcheckoutOriginalRendererReady = bridge.isRendererReady;
            window.fastcheckoutTestRendererReady = false;
            bridge.isRendererReady = (methodCode) => (
                methodCode === 'purchaseorder'
                    ? window.fastcheckoutTestRendererReady
                    : window.fastcheckoutOriginalRendererReady(methodCode)
            );
            document.dispatchEvent(new CustomEvent('fastcheckout:payment-selection-changed', {
                detail: { method: 'purchaseorder' }
            }));
        });
        await expect.poll(() => placeOrderButtons.evaluateAll((buttons) => (
            buttons.every((button) => button.disabled)
        ))).toBe(true);

        await page.evaluate(() => {
            window.fastcheckoutTestRendererReady = true;
            document.dispatchEvent(new CustomEvent('fastcheckout:payment-selection-changed', {
                detail: { method: 'purchaseorder' }
            }));
        });
        await expect.poll(() => placeOrderButtons.evaluateAll((buttons) => (
            buttons.every((button) => !button.disabled)
        ))).toBe(true);
        await page.evaluate(() => {
            window.fastcheckoutHyvaPayment.isRendererReady =
                window.fastcheckoutOriginalRendererReady;
        });
    });

    test('shipping and payment selections run their native KO component hooks', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        await page.evaluate(() => new Promise((resolve, reject) => {
            window.require(['uiRegistry'], (registry) => {
                const component = registry.get('checkout.steps.shipping-step.shippingAddress');
                const original = component.selectShippingMethod;

                window.fastcheckoutNativeShippingSelectCalls = 0;
                component.selectShippingMethod = function () {
                    window.fastcheckoutNativeShippingSelectCalls += 1;
                    return original.apply(this, arguments);
                };
                resolve();
            }, reject);
        }));

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutNativeShippingSelectCalls
        ))).toBe(1);

        const purchaseOrder = page.locator(
            'input[name="payment_method"][value="purchaseorder"]:visible:not(:disabled)'
        );
        await expect(purchaseOrder).toBeVisible({ timeout: 30_000 });
        await purchaseOrder.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutHyvaPayment.isRendererReady('purchaseorder')
        )), { timeout: 30_000 }).toBe(true);

        expect(await page.evaluate(() => {
            const component = window.fastcheckoutHyvaPayment.getActiveRenderer();

            return {
                method: component.getCode(),
                rendererOwnsSelection: !Object.prototype.hasOwnProperty.call(
                    component,
                    'selectPaymentMethod'
                )
            };
        })).toEqual({
            method: 'purchaseorder',
            rendererOwnsSelection: true
        });
    });

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
                /\/V1\/guest-carts\/[^/]+\/(?:payment-information|order)(?:\?|$)/.test(request.url())
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
        const shippingSelection = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), { timeout: 10_000 }).catch(() => null);
        await shippingMethod.evaluate((input) => input.click());
        await shippingSelection;

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
        const defaultTextColor = await poNumber.evaluate((input) => getComputedStyle(input).color);
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
        await expect(target.locator('#' + errorId)).toHaveText('To jest wymagane pole.');
        await expect(poNumber).toHaveCSS('color', defaultTextColor);
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

    test('main checkout submit delegates renderer and additional validation once', async ({ page }) => {
        const submitRequests = [];
        let orderRequests = 0;

        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/V1\/guest-carts\/[^/]+\/(?:payment-information|order)(?:\?|$)/.test(request.url())
            ) {
                submitRequests.push(request.url());
            }
            if (
                request.method() === 'POST' &&
                /\/V1\/guest-carts\/[^/]+\/(?:payment-information|order)(?:\?|$)/.test(request.url())
            ) {
                orderRequests += 1;
            }
        });

        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="flatrate_flatrate"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        const shippingSelection = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), { timeout: 10_000 }).catch(() => null);
        await shippingMethod.evaluate((input) => input.click());
        await shippingSelection;

        const paymentMethod = page.locator(
            'input[name="payment_method"]:visible:not(:disabled):not([value="purchaseorder"])'
        ).first();
        await expect(paymentMethod).toBeVisible({ timeout: 30_000 });
        const methodCode = await paymentMethod.getAttribute('value');
        await paymentMethod.evaluate((input) => input.click());

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]'
        );
        await expect(target).toBeVisible();
        await target.evaluate((root) => {
            const input = document.createElement('input');
            const hidden = document.createElement('input');
            const hiddenWrapper = document.createElement('div');

            input.id = 'fastcheckout-third-party-required';
            input.name = 'payment[third_party_required]';
            input.className = 'required-entry';
            input.setAttribute('data-validate', "{'required':true}");
            input.setAttribute('data-msg-required', 'Pole testowego modułu jest wymagane.');
            root.appendChild(input);

            hidden.id = 'fastcheckout-hidden-required';
            hidden.className = 'required-entry';
            hidden.setAttribute('aria-required', 'true');
            hidden.setAttribute('data-validate', "{'required':true}");
            hiddenWrapper.style.display = 'none';
            hiddenWrapper.appendChild(hidden);
            root.appendChild(hiddenWrapper);
        });
        await page.evaluate((code) => new Promise((resolve, reject) => {
            window.require(['jquery', 'mage/validation'], ($) => {
                const component = window.fastcheckoutHyvaPayment.getActiveRenderer();
                const originalPlaceOrder = component.placeOrder;
                const root = document.querySelector(
                    '[data-fastcheckout-payment-method-ko-target="' + code + '"]'
                );

                window.fastcheckoutRendererValidateCalls = 0;
                window.fastcheckoutRendererPlaceOrderCalls = 0;
                component.validate = function () {
                    const field = root.querySelector('#fastcheckout-third-party-required');

                    window.fastcheckoutRendererValidateCalls += 1;
                    $(field.form).validation();

                    return $(field).valid();
                };
                component.placeOrder = function () {
                    window.fastcheckoutRendererPlaceOrderCalls += 1;

                    return originalPlaceOrder.apply(this, arguments);
                };
                resolve();
            }, reject);
        }), methodCode);

        const input = target.locator('#fastcheckout-third-party-required');
        submitRequests.length = 0;
        await page.locator('[data-fastcheckout-place-order]:visible').evaluate(
            (button) => button.click()
        );

        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(target.locator('#fastcheckout-third-party-required-error')).toHaveText(
            'Pole testowego modułu jest wymagane.'
        );
        await expect(target.locator('#fastcheckout-hidden-required')).not.toHaveAttribute(
            'aria-invalid',
            'true'
        );
        await expect.poll(() => page.evaluate(() => ({
            validate: window.fastcheckoutRendererValidateCalls,
            placeOrder: window.fastcheckoutRendererPlaceOrderCalls
        }))).toEqual({validate: 1, placeOrder: 1});
        expect(submitRequests).toEqual([]);

        await input.fill('VALID');
        await input.blur();
        await page.evaluate(() => {
            window.fastcheckoutHyvaPayment.getActiveRenderer().validate();
        });
        await expect(input).toHaveAttribute('aria-invalid', 'false');
        await page.evaluate((code) => new Promise((resolve, reject) => {
            window.require([
                'Magento_Checkout/js/model/payment/additional-validators'
            ], (additionalValidators) => {
                const component = window.fastcheckoutHyvaPayment.getActiveRenderer();
                const root = document.querySelector(
                    '[data-fastcheckout-payment-method-ko-target="' + code + '"]'
                );

                window.fastcheckoutRendererValidateCalls = 0;
                window.fastcheckoutRendererAdditionalValidatorCalls = 0;
                window.fastcheckoutRendererPlaceOrderCalls = 0;
                component.validate = function () {
                    window.fastcheckoutRendererValidateCalls += 1;

                    return true;
                };
                additionalValidators.registerValidator({
                    validate: function () {
                        let error = root.querySelector('[data-test-renderer-contract-error]');

                        window.fastcheckoutRendererAdditionalValidatorCalls += 1;
                        if (!error) {
                            error = document.createElement('p');
                            error.className = 'field-error';
                            error.setAttribute('role', 'alert');
                            error.setAttribute('data-test-renderer-contract-error', 'true');
                            error.textContent = 'Błąd walidacji renderera.';
                            root.appendChild(error);
                        }

                        return false;
                    }
                });
                resolve();
            }, reject);
        }), methodCode);

        orderRequests = 0;
        await page.locator('[data-fastcheckout-place-order]:visible').evaluate(
            (button) => button.click()
        );

        await expect(target.locator('[data-test-renderer-contract-error]')).toBeVisible();
        await expect.poll(() => page.evaluate(() => ({
            validate: window.fastcheckoutRendererValidateCalls,
            additional: window.fastcheckoutRendererAdditionalValidatorCalls,
            placeOrder: window.fastcheckoutRendererPlaceOrderCalls
        }))).toEqual({validate: 1, additional: 1, placeOrder: 1});
        await expect(page.locator(
            '[data-fastcheckout-client-order-error]:visible'
        )).toHaveCount(0);
        expect(orderRequests).toBe(0);
    });

    test('late renderer errors stay observed until navigation', async ({ page }) => {
        let orderRequests = 0;

        page.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/V1\/guest-carts\/[^/]+\/(?:payment-information|order)(?:\?|$)/.test(request.url())
            ) {
                orderRequests += 1;
            }
        });

        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="flatrate_flatrate"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());

        const paymentMethod = page.locator(
            'input[name="payment_method"][value="cashondelivery"]:visible:not(:disabled)'
        );
        await expect(paymentMethod).toBeVisible({ timeout: 30_000 });
        const methodCode = await paymentMethod.getAttribute('value');
        await paymentMethod.evaluate((input) => input.click());

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]'
        );
        await expect(target).toBeVisible();
        await page.evaluate((code) => new Promise((resolve, reject) => {
            window.require(['knockout'], (ko) => {
                const component = window.fastcheckoutHyvaPayment.getActiveRenderer();
                const root = document.querySelector(
                    '[data-fastcheckout-payment-method-ko-target="' + code + '"]'
                );
                const inlineError = document.createElement('p');
                const nativeSetTimeout = window.setTimeout.bind(window);

                inlineError.className = 'payu-msg';
                inlineError.setAttribute('role', 'alert');
                inlineError.setAttribute('data-test-late-renderer-error', 'true');
                root.appendChild(inlineError);

                // Compress the removed legacy 30-second cleanup so this test fails
                // quickly if it is reintroduced.
                window.setTimeout = function (callback, delay) {
                    return nativeSetTimeout(callback, delay === 30000 ? 20 : delay);
                };
                component.secureFormError = ko.observable('');
                component.secureFormError.subscribe((message) => {
                    inlineError.textContent = message || '';
                });
                component.validate = () => true;
                component.placeOrder = function () {
                    window.fastcheckoutLateRendererPlaceOrderCalls =
                        (window.fastcheckoutLateRendererPlaceOrderCalls || 0) + 1;
                    nativeSetTimeout(() => {
                        this.secureFormError('Spóźniony błąd walidacji renderera.');
                    }, 60);

                    return false;
                };
                resolve();
            }, reject);
        }), methodCode);

        orderRequests = 0;
        const submit = page.locator('[data-fastcheckout-place-order]:visible');
        await submit.evaluate((button) => button.click());

        await expect(target.locator('[data-test-late-renderer-error]')).toHaveText(
            'Spóźniony błąd walidacji renderera.'
        );
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutLateRendererPlaceOrderCalls || 0
        ))).toBe(1);
        await expect(submit).toBeEnabled();
        await expect(page.locator(
            '[data-fastcheckout-client-order-error]:visible'
        )).toHaveCount(0);
        expect(orderRequests).toBe(0);
    });

    test('shipping address validation scrolls smoothly to the first error', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => (
            typeof window.fastcheckoutHyvaShipping?.focusFirstInvalidField === 'function'
        ));
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            window.fastcheckoutTestAddressScrollPositions = [];
            const sampler = window.setInterval(() => {
                window.fastcheckoutTestAddressScrollPositions.push(window.scrollY);
            }, 16);
            window.setTimeout(() => window.clearInterval(sampler), 600);
        });

        await page.locator('[data-fastcheckout-place-order-mobile]:visible').evaluate(
            (button) => button.click()
        );

        const invalid = page.locator(
            '.fastcheckout-native-shipping-address [aria-invalid="true"]'
        ).first();
        await expect(invalid).toBeVisible();
        await expect(page.locator(
            '[data-fastcheckout-client-order-error]:visible'
        )).toHaveCount(0);
        await expect.poll(async () => invalid.evaluate((element) => {
            const rect = element.getBoundingClientRect();

            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        })).toBe(true);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => (
            new Set(window.fastcheckoutTestAddressScrollPositions).size
        ))).toBeGreaterThan(2);
    });

    test('email validation keeps one current inline error', async ({ page }) => {
        await openCheckoutWithProduct(page);

        const email = page.locator(
            '.fastcheckout-native-shipping-address input[name="email"]'
        );
        const error = page.locator('#customer-email-error');
        const submit = page.locator('[data-fastcheckout-place-order]:visible');

        await submit.evaluate((button) => button.click());
        await submit.evaluate((button) => button.click());
        await expect(error).toHaveCount(1);
        await expect(error).toHaveText('To jest wymagane pole.');

        await email.fill('invalid-email');
        await email.blur();
        await submit.evaluate((button) => button.click());
        await submit.evaluate((button) => button.click());
        await expect(error).toHaveCount(1);
        await expect(error).toHaveText('Podaj poprawny adres email (Ex: johndoe@domain.com).');

        await email.fill('validation@example.com');
        await email.blur();
        await expect(error).toHaveCount(0);
    });

    test('shipping validator error scrolls back to the shipping method', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());

        const paymentMethod = page.locator(
            'input[name="payment_method"]:visible:not(:disabled)'
        ).first();
        await expect(paymentMethod).toBeVisible({ timeout: 30_000 });
        await paymentMethod.evaluate((input) => input.click());

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => (
            typeof window.fastcheckoutHyvaShipping?.registerValidator === 'function' &&
            typeof window.fastcheckoutHyvaPayment?.focusFirstInvalidField === 'function'
        ));
        await page.evaluate(() => {
            window.fastcheckoutHyvaShipping.registerValidator(() => {
                const selected = document.querySelector(
                    'input[name="shipping_method"]:checked'
                );
                const option = selected?.closest('.fastcheckout-shipping-method-option') ||
                    selected?.closest('label') ||
                    selected?.parentElement;
                const host = document.querySelector('[data-fastcheckout-shipping-methods]') ||
                    document.getElementById('fastcheckout-ko-shipping-root');
                let error = document.querySelector('[data-test-shipping-validator-error]');

                if (!error) {
                    error = document.createElement('div');
                    error.className = 'field-error';
                    error.setAttribute('role', 'alert');
                    error.setAttribute('data-test-shipping-validator-error', 'true');
                    error.textContent = 'Wybierz punkt odbioru.';
                    (option || host)?.appendChild(error);
                }
                if (error && !error.isConnected && host) {
                    host.appendChild(error);
                }

                return false;
            });
            window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            window.fastcheckoutTestScrollPositions = [];
            const sampler = window.setInterval(() => {
                window.fastcheckoutTestScrollPositions.push(window.scrollY);
            }, 16);
            window.setTimeout(() => window.clearInterval(sampler), 600);
        });

        // Prefer form submit so placeOrderViaKo runs shipping validate + focus.
        await page.locator('[data-fastcheckout-place-order-mobile]:visible').evaluate(
            (button) => {
                const form = button.closest('form') || document.getElementById('co-checkout-form');
                if (form && typeof form.requestSubmit === 'function') {
                    form.requestSubmit(button);
                } else if (form) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                } else {
                    button.click();
                }
            }
        );

        const error = page.locator('[data-test-shipping-validator-error]');
        await expect(error).toBeVisible();
        await expect.poll(async () => error.evaluate((element) => {
            const rect = element.getBoundingClientRect();

            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        })).toBe(true);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => (
            new Set(window.fastcheckoutTestScrollPositions).size
        ))).toBeGreaterThan(2);
    });

    test('missing payment method validation is displayed in Polish', async ({ page }) => {
        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:visible:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        await shippingMethod.evaluate((input) => input.click());

        const paymentMethod = page.locator(
            'input[name="payment_method"]:visible:not(:disabled)'
        ).first();
        await expect(paymentMethod).toBeVisible({ timeout: 30_000 });
        const paymentCode = await paymentMethod.inputValue();
        await page.evaluate(() => new Promise((resolve) => {
            const settings = window.checkoutConfig.fastcheckoutSettings;
            const shippingCode = document.querySelector(
                'input[name="shipping_method"]:checked'
            )?.value;

            settings.shippingPaymentMapping = [];
            window.fastcheckoutHyvaShipping.applyPaymentRemapForShipping(shippingCode);
            window.fastcheckoutHyvaPayment?.clearUserPaymentSelection();
            window.fastcheckoutHyvaPayment?.selectPaymentMethod('');
            window.require([
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/checkout-data'
            ], (quote, checkoutData) => {
                quote.paymentMethod(null);
                checkoutData.setSelectedPaymentMethod(null);
                document.querySelectorAll('input[name="payment_method"]').forEach((input) => {
                    input.checked = false;
                    input.disabled = true;
                });
                window.fastcheckoutPaymentValidationScrollTarget = '';
                const scrollIntoView = Element.prototype.scrollIntoView;

                Element.prototype.scrollIntoView = function (options) {
                    if (this.matches('[data-fastcheckout-payment-selection-error]')) {
                        window.fastcheckoutPaymentValidationScrollTarget =
                            options && options.behavior;
                    }

                    return scrollIntoView.call(this, options);
                };
                resolve();
            }, resolve);
        }));

        await page.locator('[data-fastcheckout-place-order]:visible').evaluate(
            (button) => button.click()
        );

        const error = page.locator(
            '[data-fastcheckout-payment-selection-error]:visible'
        );
        await expect(error).toHaveText('Wybierz metodę płatności.');
        await expect(error).toHaveClass(/border-red-200/);
        await expect(error).toHaveClass(/bg-red-50/);
        await expect(error).not.toContainText('Please select a payment method.');
        await expect(page.locator(
            '[data-fastcheckout-client-order-error]:visible'
        )).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutPaymentValidationScrollTarget
        ))).toBe('smooth');
        await expect.poll(() => error.evaluate((element) => {
            const rect = element.getBoundingClientRect();

            return rect.top >= 0 && rect.bottom <= window.innerHeight;
        })).toBe(true);
        await page.evaluate((code) => {
            const input = Array.from(document.querySelectorAll('input[name="payment_method"]'))
                .find((candidate) => candidate.value === code);

            input.disabled = false;
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, paymentCode);
        await expect(error).toBeHidden();
    });

    test('place order keeps the primary loader through success navigation', async ({ page }) => {
        let requestBlocked = false;
        let releaseRequest;
        const requestGate = new Promise((resolve) => {
            releaseRequest = resolve;
        });

        await openCheckoutWithProduct(page);
        await fillPolishShippingAddress(page);

        const shippingMethod = page.locator(
            'input[name="shipping_method"][value="tablerate_bestway"]:not(:disabled)'
        );
        await expect(shippingMethod).toBeVisible({ timeout: 30_000 });
        const shippingSelection = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), { timeout: 10_000 }).catch(() => null);
        await shippingMethod.evaluate((input) => input.click());
        await shippingSelection;

        const purchaseOrder = page.locator(
            'input[name="payment_method"][value="purchaseorder"]:not(:disabled)'
        );
        await expect(purchaseOrder).toBeVisible({ timeout: 30_000 });
        await purchaseOrder.evaluate((input) => input.click());

        const target = page.locator(
            '[data-fastcheckout-payment-method-ko-target="purchaseorder"]'
        );
        await target.locator('input[name="payment[po_number]"]').fill(
            'FC-LOADER-' + Date.now()
        );
        await page.locator(
            '.checkout-agreement input[type="checkbox"], input[name*="agreement"]'
        ).evaluateAll((checkboxes) => {
            checkboxes.forEach((checkbox) => {
                if (!checkbox.checked) {
                    checkbox.click();
                }
            });
        });

        await page.route(
            /\/V1\/guest-carts\/[^/]+\/payment-information(?:\?|$)/,
            async (route) => {
                requestBlocked = true;
                await requestGate;
                await route.abort('failed');
            }
        );

        const button = page.locator('[data-fastcheckout-place-order]:visible').first();
        await expect(button).toBeVisible();
        const readyBackground = await button.evaluate(
            (element) => getComputedStyle(element).backgroundColor
        );

        await button.evaluate((element) => element.click());
        await expect.poll(() => requestBlocked).toBe(true);

        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute('aria-busy', 'true');
        await expect(button.locator('[data-fastcheckout-place-order-spinner]')).toBeVisible();
        await expect(button.locator('[data-fastcheckout-place-order-label]')).toHaveText(
            'Prosimy czekać...'
        );
        expect(await button.evaluate(
            (element) => getComputedStyle(element).backgroundColor
        )).toBe(readyBackground);
        expect(await button.evaluate(
            (element) => getComputedStyle(element).opacity
        )).toBe('1');

        await page.setViewportSize({ width: 390, height: 844 });
        const mobileButton = page.locator('[data-fastcheckout-place-order-mobile]');
        await expect(mobileButton).toBeVisible();
        await expect(mobileButton).toBeDisabled();
        await expect(mobileButton).toHaveAttribute('aria-busy', 'true');
        await expect(
            mobileButton.locator('[data-fastcheckout-place-order-spinner]')
        ).toBeVisible();
        await expect(
            mobileButton.locator('[data-fastcheckout-place-order-label]')
        ).toHaveText('Prosimy czekać...');
        expect(await mobileButton.evaluate(
            (element) => getComputedStyle(element).opacity
        )).toBe('1');

        releaseRequest();
        await expect(mobileButton).toBeEnabled();
        await expect(mobileButton).not.toHaveAttribute('aria-busy', 'true');
        await expect(
            mobileButton.locator('[data-fastcheckout-place-order-spinner]')
        ).toBeHidden();
        await expect(mobileButton.locator('[data-fastcheckout-place-order-label]')).toHaveText(
            'Złóż zamówienie'
        );

        // Resolve the bridge successfully but deliberately delay navigation.
        // The loader must not flash back to the ready state in that interval.
        await page.evaluate(() => {
            window.fastcheckoutTestAfterPlaceOrder = false;
            window.fastcheckoutHyvaPayment.placeOrder = function () {
                document.dispatchEvent(new CustomEvent('fastcheckout:order-submit-started'));
                return Promise.resolve({ testOrderResult: true });
            };
            window.fastcheckoutHyvaPayment.afterPlaceOrder = function () {
                window.fastcheckoutTestAfterPlaceOrder = true;
            };
        });

        await mobileButton.evaluate((element) => element.click());
        await expect.poll(() => page.evaluate(
            () => window.fastcheckoutTestAfterPlaceOrder
        )).toBe(true);
        await expect(mobileButton).toBeDisabled();
        await expect(mobileButton).toHaveAttribute('aria-busy', 'true');
        await expect(
            mobileButton.locator('[data-fastcheckout-place-order-spinner]')
        ).toBeVisible();
        await expect(mobileButton.locator('[data-fastcheckout-place-order-label]')).toHaveText(
            'Prosimy czekać...'
        );
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
        const successNavigations = [];
        const privateContentErrors = [];

        page.on('request', (request) => {
            if (
                request.isNavigationRequest() &&
                /\/checkout\/onepage\/success\/?(?:\?|$)/.test(request.url())
            ) {
                successNavigations.push(request.url());
            }
        });
        page.on('console', (message) => {
            if (message.text().includes("Couldn't fetch privateContent")) {
                privateContentErrors.push(message.text());
            }
        });

        await poNumber.blur();
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutHyvaPayment.getActiveRenderer().getData().po_number
        ))).toBe(expectedPoNumber);
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
        await page.waitForLoadState('networkidle');
        expect(successNavigations).toHaveLength(1);
        expect(privateContentErrors).toEqual([]);

        const createAccount = page.locator(
            'a[href*="/checkout/account/delegateCreate"]'
        );
        await expect(createAccount).toBeVisible();

        console.log('Created Purchase Order test order entity ID:', orderEntityId);
    });
});
