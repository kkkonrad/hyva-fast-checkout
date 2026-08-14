import {test, expect} from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://m10626.app-on-demand.net/';
const PRODUCT = process.env.FC_SIMPLE_PRODUCT_URL || 'aim-analog-watch.html';
const EXPECT_TWO_STEP = process.env.FC_EXPECT_TWO_STEP === '1';

async function dismissConsent(page) {
    const button = page.getByRole('button', {
        name: /Odrzuć opcjonalne|Reject optional|Reject all/i
    }).first();

    if (await button.isVisible({timeout: 3_000}).catch(() => false)) {
        await button.click({force: true});
        await button.waitFor({state: 'hidden', timeout: 5_000}).catch(() => {});
    }
}

async function openCheckoutWithProduct(page) {
    const pageErrors = [];

    await page.addInitScript(() => {
        if (window === window.top && /\/checkout(?:\/|$)/.test(location.pathname)) {
            [
                'mage-cache-storage',
                'mage-cache-storage-section-invalidation'
            ].forEach((key) => localStorage.setItem(key, 'null'));
        }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(new URL(PRODUCT, BASE).href, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000
    });
    await dismissConsent(page);

    const add = page.getByRole('button', {name: /Dodaj do koszyka|Add to Cart/i});
    await expect(add).toBeVisible({timeout: 30_000});
    await add.click();
    await page.waitForTimeout(1_000);

    await page.goto(new URL('checkout/?compat=' + Date.now(), BASE).href, {
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

    const scripts = await page.locator('script[src]').evaluateAll((nodes) => (
        nodes.map((node) => node.src)
    ));
    const scriptIndex = (part) => scripts.findIndex((src) => src.includes(part));
    const baseIndex = scriptIndex('Kkkonrad_Fastcheckout/js/requirejs-base.js');
    const requireIndex = scriptIndex('/requirejs/require.js');
    const mixinsIndex = scriptIndex('/mage/requirejs/mixins.js');
    const configIndex = scriptIndex('/requirejs-config.js');
    const inPostIndex = scriptIndex('Smartmage_Inpost/js/inpost-event.js');

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(baseIndex).toBeLessThan(requireIndex);
    expect(requireIndex).toBeLessThan(mixinsIndex);
    expect(requireIndex).toBeLessThan(configIndex);
    if (inPostIndex >= 0) {
        expect(mixinsIndex).toBeLessThan(inPostIndex);
        expect(configIndex).toBeLessThan(inPostIndex);
    }

    return {hasInPost: inPostIndex >= 0, pageErrors};
}

async function fillShippingAddress(page, emailPrefix) {
    const shippingRoot = page.locator('.fastcheckout-native-shipping-address');

    await expect(shippingRoot.locator('input[name="firstname"]'))
        .toBeVisible({timeout: 45_000});
    await shippingRoot.locator('input[name="username"]').fill(
        emailPrefix + '-' + Date.now() + '@example.com'
    );

    const country = shippingRoot.locator('select[name="country_id"]');
    if (await country.isVisible()) {
        await country.selectOption('PL');
    }

    const region = shippingRoot.locator('select[name="region_id"]');
    if (await region.isVisible()) {
        await expect.poll(() => region.locator('option').count(), {timeout: 15_000})
            .toBeGreaterThan(1);
        await region.selectOption(await region.locator('option').evaluateAll((options) => (
            options.map((option) => option.value).find(Boolean)
        )));
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

    return shippingRoot;
}

test.describe('Fastcheckout native Magento compatibility host', () => {
    test.skip(EXPECT_TWO_STEP, 'Run the dedicated native two-step scenario.');

    test('keeps the Fastcheckout presentation and canonical component tree', async ({page}) => {
        test.setTimeout(150_000);
        const assetFailures = [];

        page.on('response', (response) => {
            if (page.url().includes('/checkout/') && response.status() >= 400 &&
                new URL(response.url()).origin === new URL(BASE).origin &&
                /\.(?:js|html)(?:\?|$)/i.test(response.url())) {
                assetFailures.push(response.status() + ' ' + response.url());
            }
        });

        await openCheckoutWithProduct(page);
        const registryNames = [
            'checkoutProvider',
            'checkout.steps.shipping-step.shippingAddress',
            'checkout.steps.billing-step.payment',
            'checkout.steps.billing-step.payment.payments-list',
            'checkout.sidebar',
            'checkout.sidebar.summary',
            'checkout.sidebar.shipping-information'
        ];
        await expect.poll(() => page.evaluate((names) => {
            const registry = window.require('uiRegistry');

            return names.filter((name) => !registry.get(name));
        }, registryNames), {timeout: 45_000}).toEqual([]);

        await expect(page.getByRole('heading', {
            name: /Adres wysyłki|Shipping Address/i
        })).toBeVisible();
        await expect(page.getByRole('heading', {
            name: /Metoda dostawy|Shipping Method/i
        })).toBeVisible();
        await expect(page.getByRole('heading', {
            name: /Metoda płatności|Payment Method/i
        })).toBeVisible();
        await expect(page.getByRole('heading', {
            name: /Podsumowanie zamówienia|Order Summary/i
        })).toBeVisible();
        const nativeSummary = page.locator(
            '#fastcheckout-ko-summary-root .fastcheckout-native-summary'
        );
        await expect(nativeSummary.locator('.product-item')).toBeVisible({timeout: 45_000});
        await expect(nativeSummary.locator('.table-totals tr.grand.totals').first()).toBeVisible();
        expect(await nativeSummary.locator('.table-totals tbody tr').evaluateAll((rows) => (
            rows.every((row) => {
                const mark = row.querySelector('th.mark')?.getBoundingClientRect(),
                    amount = row.querySelector('td.amount')?.getBoundingClientRect();

                return mark && amount &&
                    Math.abs(mark.width / (mark.width + amount.width) - 0.75) < 0.01;
            })
        ))).toBe(true);
        await expect(page.locator('[data-fastcheckout-summary-ssr]')).toHaveCount(0);
        const initialPlaceOrder = page.locator('[data-fastcheckout-place-order-ssr]');
        await expect(initialPlaceOrder).toBeVisible();
        await expect(initialPlaceOrder).toBeEnabled();

        const geometry = await page.evaluate(() => {
            const left = document.querySelector('.fc-left-wrapper').getBoundingClientRect();
            const right = document.querySelector('.fc-right-wrapper').getBoundingClientRect();
            const registry = window.require('uiRegistry');
            const shipping = registry.get('checkout.steps.shipping-step.shippingAddress');
            const payment = registry.get('checkout.steps.billing-step.payment');

            return {
                twoColumns: window.innerWidth < 1024 || (
                    left.width > 400 && right.width > 400 && right.left > left.right
                ),
                desktopRatio: window.innerWidth < 1024 ||
                    Math.abs(left.width / (left.width + right.width) - 0.5) < 0.01,
                hyvaAssets: Array.from(document.querySelectorAll('link[href], script[src]'))
                    .some((node) => (node.href || node.src || '').includes('/Hyva/default/')),
                fallbackThemeAssets: Array.from(
                    document.querySelectorAll('link[href], script[src]')
                ).some((node) => /\/Magento\/(?:blank|luma)\//.test(node.href || node.src || '')),
                noFallbackNotice: !document.body.textContent.includes('No Checkout module installed.'),
                noAuthenticationChrome:
                    !document.querySelector('#fastcheckout-checkout .authentication-wrapper'),
                shippingAdditional: typeof shipping.getRegion('shippingAdditional') === 'function',
                beforeShippingForm:
                    typeof shipping.getRegion('before-shipping-method-form') === 'function',
                beforeMethods: typeof payment.getRegion('beforeMethods') === 'function',
                afterMethods: typeof payment.getRegion('afterMethods') === 'function',
                nativeDom: [
                    '#checkout[data-bind*="checkout"]',
                    '#shipping',
                    '#checkout-step-shipping[data-role="content"]',
                    '#opc-shipping_method',
                    '#checkout-step-shipping_method[data-role="content"]',
                    '#co-shipping-method-form',
                    '#payment',
                    '#checkout-step-payment[data-role="content"]',
                    '#co-payment-form'
                ].every((selector) => document.querySelector(selector)),
                shippingTemplateHooks: Boolean(
                    shipping.shippingMethodListTemplate && shipping.shippingMethodItemTemplate
                )
            };
        });

        expect(geometry).toEqual({
            twoColumns: true,
            desktopRatio: true,
            hyvaAssets: true,
            fallbackThemeAssets: false,
            noFallbackNotice: true,
            noAuthenticationChrome: true,
            shippingAdditional: true,
            beforeShippingForm: true,
            beforeMethods: true,
            afterMethods: true,
            nativeDom: true,
            shippingTemplateHooks: true
        });
        expect(await page.evaluate(() => [
            'mage-cache-storage',
            'mage-cache-storage-section-invalidation'
        ].every((key) => {
            const value = JSON.parse(localStorage.getItem(key));

            return value && typeof value === 'object' && !Array.isArray(value);
        }))).toBe(true);

        const configuredStylesheets = await page.evaluate(() => {
            const hrefs = [];

            function collect(config) {
                Object.keys(config || {}).forEach((key) => {
                    const value = config[key];

                    if (key.toLowerCase() === 'addcss' && typeof value === 'string') {
                        const container = document.createElement('div');

                        container.innerHTML = value;
                        container.querySelectorAll('link[rel~="stylesheet"][href]')
                            .forEach((link) => hrefs.push(link.href));
                    } else if (value && typeof value === 'object') {
                        collect(value);
                    }
                });
            }

            collect(window.checkoutConfig);

            return [...new Set(hrefs)];
        });
        await expect.poll(() => page.evaluate((hrefs) => (
            hrefs.filter((href) => !Array.from(document.head.querySelectorAll(
                'link[rel~="stylesheet"][href]'
            )).some((link) => link.href === href))
        ), configuredStylesheets), {timeout: 10_000}).toEqual([]);

        await page.setViewportSize({width: 390, height: 844});
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeVisible();
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeEnabled();
        await expect(page.locator('[data-fastcheckout-next-step-mobile]')).toHaveCount(0);
        await expect(page.locator(
            '[data-fastcheckout-mobile-sticky] [data-fastcheckout-client-order-error]'
        )).toHaveCount(0);
        expect(assetFailures, assetFailures.join('\n')).toEqual([]);
    });

    test('validates shipping and Purchase Order, optionally placing an order', async ({page}) => {
        test.setTimeout(180_000);
        const {hasInPost, pageErrors} = await openCheckoutWithProduct(page);
        const shippingRoot = page.locator('.fastcheckout-native-shipping-address');
        await expect(shippingRoot.locator('input[name="firstname"]'))
            .toBeVisible({timeout: 45_000});
        let paymentRequests = 0,
            placeOrderRequests = null;
        page.on('request', (request) => {
            if (request.method() === 'POST' && request.url().includes('/payment-information')) {
                paymentRequests += 1;
            }
            if (placeOrderRequests && request.method() === 'POST' &&
                /\/(?:estimate-shipping-methods|shipping-information|payment-information)(?:\?|$)/
                    .test(request.url())) {
                placeOrderRequests.push(request.url());
            }
        });

        const initialProxy = page.locator('[data-fastcheckout-place-order-ssr]');
        await expect(initialProxy).toBeEnabled();
        await expect(initialProxy).toHaveAttribute(
            'data-fastcheckout-native-target-ready', /[01]/
        );
        await initialProxy.click({force: true});
        await expect(shippingRoot.locator('input[name="firstname"]'))
            .toHaveAttribute('aria-invalid', 'true');
        await expect(page.locator('[data-fastcheckout-shipping-method-error]')).toBeHidden();
        await expect(page.locator('[data-fastcheckout-client-order-error]')).toBeHidden();
        expect(paymentRequests).toBe(0);

        await fillShippingAddress(page, 'compat');

        const rates = page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
        );
        await expect.poll(() => rates.count(), {timeout: 45_000}).toBeGreaterThan(0);

        const pickupRateValue = await rates.evaluateAll((inputs) => {
            const configured = (window.checkoutConfig.FurgonetkaPl?.mapConfiguration || [])
                .flatMap((entry) => entry.ids || [])
                .map((id) => id.replace(':', '_'));

            return inputs.map((input) => input.value).find((value) => (
                value.includes('inpostlocker') || configured.includes(value)
            )) || '';
        });

        if (pickupRateValue && process.env.FC_ALLOW_PLACE_ORDER !== '1') {
            const inPostRate = page.locator(
                '#fastcheckout-ko-shipping-root ' +
                `input[name="shipping_method"][value="${pickupRateValue}"]`
            );

            await expect(inPostRate).toBeVisible();
            const inPostShippingResponse = page.waitForResponse((response) => (
                response.request().method() === 'POST' &&
                response.url().includes('/shipping-information')
            ), {timeout: 45_000});
            await inPostRate.click({force: true});
            expect((await inPostShippingResponse).ok()).toBe(true);
            await expect(page.locator('[data-fastcheckout-shipping-method-error]'))
                .toBeHidden();
            await expect.poll(() => page.locator(
                '#checkout-payment-method-load .payment-method'
            ).count(), {timeout: 45_000}).toBeGreaterThan(0);
            const pickupPayment = page.locator(
                '#checkout-payment-method-load input[name="payment[method]"]'
            ).first();
            await expect(pickupPayment).toHaveCount(1);
            await pickupPayment.evaluate((input) => input.click());
            await expect.poll(() => page.evaluate(() => Boolean(
                window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
            ))).toBe(true);
            const placeOrder = page.locator('[data-fastcheckout-place-order-ssr]');
            await placeOrder.evaluate((button) => button.scrollIntoView({block: 'center'}));
            const rateWasVisible = await inPostRate.evaluate((input) => {
                const box = input.getBoundingClientRect();

                return box.top >= 0 && box.bottom <= window.innerHeight;
            });
            await page.evaluate(() => {
                window.fastcheckoutE2ePickupScroll = [window.scrollY];
                const sampler = window.setInterval(() => {
                    window.fastcheckoutE2ePickupScroll.push(window.scrollY);
                }, 16);

                window.setTimeout(() => {
                    window.clearInterval(sampler);
                    window.fastcheckoutE2ePickupScrollDone = true;
                }, 1_000);
            });
            await placeOrder.click({force: true});
            const inPostError = page.locator(
                '#checkout-step-shipping_method [data-fastcheckout-shipping-method-error]'
            );
            await expect(inPostError).toBeVisible();
            await expect.poll(() => inPostError.evaluate((error) => {
                const box = error.getBoundingClientRect();

                return box.top >= 0 && box.bottom <= window.innerHeight;
            })).toBe(true);
            await expect.poll(() => page.evaluate(() => (
                window.fastcheckoutE2ePickupScrollDone
            ))).toBe(true);
            if (!rateWasVisible) {
                expect(new Set((await page.evaluate(() => (
                    window.fastcheckoutE2ePickupScroll
                ))).map(Math.round)).size).toBeGreaterThan(2);
            }
            const selectPoint = page.locator(
                hasInPost
                    ? '[data-inpost-wrapper] [data-inpost-select-point]'
                    : '.fastcheckout-furgonetkapl-placement button'
            ).first();

            await expect(selectPoint).toBeVisible({timeout: 25_000});
            if (hasInPost) {
                await selectPoint.evaluate((button) => button.click());
                await expect(page.locator('[data-inpost-modal] inpost-geowidget')).toBeVisible();
                await page.locator('[data-inpost-modal-btn-close]').evaluate((button) => (
                    button.click()
                ));
                await expect(page.locator('[data-inpost-modal]')).toHaveCount(0);
            } else {
                await expect.poll(() => page.evaluate(() => {
                    const method = window.require(
                            'Magento_Checkout/js/model/quote'
                        ).shippingMethod(),
                        placement = document.querySelector(
                            '.fastcheckout-furgonetkapl-placement'
                        );

                    return Boolean(method && placement && placement.parentElement &&
                        placement.parentElement.id ===
                        'label_method_' + method.method_code + '_' +
                        method.carrier_code + '_additional' &&
                        placement.closest('.fastcheckout-shipping-method-option'));
                }), {timeout: 25_000}).toBe(true);
            }
        }

        const flatRate = page.locator(
            '#fastcheckout-ko-shipping-root ' +
            'input[name="shipping_method"][value="flatrate_flatrate"]'
        );
        if (await flatRate.count()) {
            const flatRateResponse = page.waitForResponse((response) => (
                response.request().method() === 'POST' &&
                response.url().includes('/shipping-information')
            ), {timeout: 45_000});
            await flatRate.click({force: true});
            expect((await flatRateResponse).ok()).toBe(true);

            const braintree = page.locator(
                'input[name="payment[method]"][value="braintree"]'
            );
            if (await braintree.count()) {
                await braintree.evaluate((input) => input.click());
                const activeBraintree = page.locator('.payment-method-braintree._active');
                const hostedControls = activeBraintree.locator('.hosted-control');

                await expect.poll(() => hostedControls.locator('iframe').count(), {
                    timeout: 45_000
                }).toBeGreaterThan(1);
                await page.evaluate(() => window.scrollTo(
                    0,
                    document.scrollingElement.scrollHeight
                ));
                await page.evaluate(() => {
                    window.fastcheckoutE2eBraintreeScroll = [window.scrollY];
                    const sampler = window.setInterval(() => {
                        window.fastcheckoutE2eBraintreeScroll.push(window.scrollY);
                    }, 16);

                    window.setTimeout(() => {
                        window.clearInterval(sampler);
                        window.fastcheckoutE2eBraintreeScrollDone = true;
                    }, 2_000);
                });
                await page.locator('[data-fastcheckout-place-order-ssr]')
                    .evaluate((button) => button.click());
                await expect.poll(() => hostedControls.evaluateAll((controls) => (
                    controls.length > 1 && controls.every((control) => (
                        control.classList.contains('braintree-hosted-fields-invalid')
                    ))
                ))).toBe(true);
                await expect.poll(() => page.evaluate(() => (
                    window.fastcheckoutE2eBraintreeScrollDone
                ))).toBe(true);
                expect(new Set((await page.evaluate(() => (
                    window.fastcheckoutE2eBraintreeScroll
                ))).map(Math.round)).size).toBeGreaterThan(2);
                await expect.poll(() => hostedControls.first().evaluate((control) => {
                    const box = control.getBoundingClientRect();

                    return box.top >= 0 && box.bottom <= window.innerHeight;
                })).toBe(true);
            }

            const payu = page.locator(
                'input[name="payment[method]"][value="payu_gateway"]'
            );
            if (await payu.count()) {
                await payu.evaluate((input) => input.click());
                const activePayu = page.locator('.payu-payment._active');
                const payuMethodError = activePayu.locator(
                    '.payment__method > .payu-msg .msg__error'
                );
                const placeOrder = page.locator('[data-fastcheckout-place-order-ssr]');

                await expect(payuMethodError).toBeHidden();
                await expect(placeOrder).toBeEnabled();
                await placeOrder.evaluate((button) => button.click());
                await expect(payuMethodError).toBeVisible();
                await activePayu.locator(
                    '.method__single--content:not(._disabled)'
                ).first().evaluate((method) => method.click());
                await expect(payuMethodError).toBeHidden();
            }

            const payuCard = page.locator(
                'input[name="payment[method]"][value="payu_gateway_card"]'
            );
            const payuCardActive = await page.evaluate(() => Boolean(
                window.checkoutConfig.payment?.payuGatewayCard?.isActive
            ));
            if (payuCardActive) {
                await expect(payuCard).toHaveCount(1, {timeout: 30_000});
                await payuCard.evaluate((input) => input.click());
                const activePayu = page.locator('.payu-payment-card._active');

                await expect(activePayu).toHaveCount(1);
                await expect(activePayu.locator('.payu-secure-form-iframe')).toHaveCount(3, {
                    timeout: 30_000
                });
                await expect(activePayu.locator('[data-fastcheckout-newsletter]')).toHaveCount(1);
                await expect(page.locator(
                    '[data-fastcheckout-agreements-summary-host] ' +
                    '[data-fastcheckout-newsletter-proxy]'
                )).toBeVisible();
                await expect(activePayu.locator('.action.checkout')).toBeHidden();
            }
        }

        const selected = page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]' +
            '[value="tablerate_bestway"]'
        );
        await expect(selected).toHaveCount(1);
        await expect(page.locator(
            '#checkout div#label_method_bestway_tablerate:empty'
        )).toHaveCount(1);
        await expect(page.locator(
            '#checkout #label_method_title_bestway_tablerate'
        )).toHaveCount(1);
        await expect(page.locator(
            '#checkout #label_method_bestway_tablerate_additional'
        )).toHaveCount(1);
        if (hasInPost && await flatRate.count()) {
            let queuedShippingRequests = 0;
            let queuedShippingResponses = 0;
            const shippingRoute = async (route) => {
                queuedShippingRequests += 1;
                if (queuedShippingRequests === 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                await route.continue();
            };
            const countShippingResponse = (response) => {
                if (response.request().method() === 'POST' &&
                    response.url().includes('/shipping-information')) {
                    queuedShippingResponses += 1;
                }
            };

            await page.route('**/shipping-information*', shippingRoute);
            page.on('response', countShippingResponse);
            await page.locator(
                '#fastcheckout-ko-shipping-root ' +
                'input[name="shipping_method"][value*="inpostlocker"]'
            ).first().click({force: true});
            await expect.poll(() => queuedShippingRequests).toBe(1);
            await selected.click({force: true});
            await expect.poll(() => queuedShippingRequests, {timeout: 45_000}).toBe(2);
            await expect.poll(() => queuedShippingResponses, {timeout: 45_000}).toBe(2);
            page.off('response', countShippingResponse);
            await page.unroute('**/shipping-information*', shippingRoute);
            expect(await page.evaluate(() => {
                const method = window.require('Magento_Checkout/js/model/quote').shippingMethod();

                return method && method.carrier_code + '_' + method.method_code;
            })).toBe('tablerate_bestway');
        } else {
            if (!await selected.isChecked()) {
                const shippingResponse = page.waitForResponse((response) => (
                    response.request().method() === 'POST' &&
                    response.url().includes('/shipping-information')
                ), {timeout: 45_000});
                await selected.click({force: true});
                expect((await shippingResponse).ok()).toBe(true);
            }
        }
        await expect.poll(() => page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote');
            const billing = quote.billingAddress();
            const shipping = quote.shippingAddress();

            return Boolean(billing && shipping &&
                billing.getCacheKey() === shipping.getCacheKey());
        })).toBe(true);

        await expect.poll(() => page.locator(
            '#checkout-payment-method-load .payment-method'
        ).count(), {timeout: 45_000}).toBeGreaterThan(0);
        expect(await page.locator('.fastcheckout-payment-after-methods').evaluate((region) => (
            !region.closest('[data-fastcheckout-payment-methods-card]') &&
            region.previousElementSibling?.matches('[data-fastcheckout-payment-methods-card]')
        ))).toBe(true);
        const missingPaymentError = page.locator('[data-fastcheckout-client-order-error]');
        await expect(missingPaymentError).toHaveCount(1);
        expect(await missingPaymentError.evaluate((error) => (
            error.closest('#co-payment-form') !== null &&
            error.nextElementSibling?.id === 'checkout-payment-method-load'
        ))).toBe(true);
        await page.evaluate(() => {
            window.require('Magento_Checkout/js/model/quote').paymentMethod(null);
        });
        await initialProxy.click({force: true});
        await expect(missingPaymentError).toBeVisible();
        await expect(missingPaymentError).toContainText(
            'Brakuje metody płatności. Wybierz metodę płatności i spróbuj ponownie.'
        );
        await expect.poll(() => missingPaymentError.evaluate((error) => {
            const box = error.getBoundingClientRect();

            return box.top >= 0 && box.bottom <= window.innerHeight;
        })).toBe(true);
        await page.locator(
            '#checkout-payment-method-load input[name="payment[method]"]'
        ).first().evaluate((input) => input.click());
        await expect(missingPaymentError).toBeHidden();
        const activePayment = page.locator(
            '.fastcheckout-ko-payment-root .payment-method._active'
        );
        await expect(activePayment).toHaveCount(1);
        const activePaymentCode = await activePayment.locator(
                'input[name="payment[method]"]'
            ).inputValue(),
            closedPayment = page.locator(
                '.fastcheckout-ko-payment-root .payment-method:not(._active)'
            ).first();
        if (await closedPayment.count()) {
            const closedPaymentCode = await closedPayment.locator(
                'input[name="payment[method]"]'
            ).inputValue();

            await closedPayment.evaluate((method) => method.click());
            await expect.poll(() => page.evaluate(() => (
                window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
            ))).toBe(closedPaymentCode);
            await page.locator(
                `input[name="payment[method]"][value="${activePaymentCode}"]`
            ).evaluate((input) => input.click());
            await expect.poll(() => page.evaluate(() => (
                window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
            ))).toBe(activePaymentCode);
        }
        const nativeAgreements = activePayment.locator('.checkout-agreements-block');
        await expect(nativeAgreements).toHaveCount(1);
        await expect(activePayment.locator('[data-fastcheckout-newsletter]')).toContainText(
            'Zapisz się do naszego newslettera'
        );
        await expect.poll(() => nativeAgreements.evaluate((block) => (
            block.closest('.payment-method._active') !== null &&
            block.querySelector('[data-fastcheckout-newsletter]')
                ?.nextElementSibling?.matches('[data-role="checkout-agreements"]')
        ))).toBe(true);
        const agreementsPortal = page.locator(
            '[data-fastcheckout-agreements-summary-host]'
        );
        await expect(agreementsPortal).toBeVisible();
        await expect(agreementsPortal.locator(
            '[data-fastcheckout-newsletter-proxy]'
        )).toContainText('Zapisz się do naszego newslettera');
        expect(await nativeAgreements.locator(
            '[data-fastcheckout-newsletter], [data-role="checkout-agreements"]'
        ).evaluateAll((parts) => parts.every((part) => (
            part.classList.contains('fastcheckout-agreements-native-source')
        )))).toBe(true);
        const orderComment = page.locator('#fastcheckout-comment');
        const newsletterProxy = agreementsPortal.locator(
            '[data-fastcheckout-newsletter-proxy] input[type="checkbox"]'
        );
        await expect(orderComment).toBeVisible();
        expect(await agreementsPortal.evaluate((host) => ({
            agreements: getComputedStyle(host.firstElementChild).borderTopWidth,
            comment: getComputedStyle(
                document.querySelector('[data-fastcheckout-order-comment]')
            ).borderTopWidth
        }))).toEqual({agreements: '0px', comment: '0px'});
        await orderComment.fill('Fastcheckout provider comment');
        await expect(newsletterProxy).toHaveCount(1);
        expect(await newsletterProxy.evaluate((input) => {
            const style = getComputedStyle(input.closest(
                '[data-fastcheckout-newsletter-proxy]'
            ));

            return [style.borderTopWidth, style.padding];
        })).toEqual(['0px', '0px']);
        await newsletterProxy.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => {
            const provider = window.require('uiRegistry').get('checkoutProvider');

            return {
                comment: provider.get('fastcheckout.comment'),
                subscribe: provider.get('fastcheckout.subscribe')
            };
        })).toEqual({
            comment: 'Fastcheckout provider comment',
            subscribe: true
        });
        await newsletterProxy.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.require('uiRegistry').get('checkoutProvider')
                .get('fastcheckout.subscribe')
        ))).toBe(false);

        const nativeAgreementInputs = nativeAgreements.locator(
            'input[type="checkbox"][name^="agreement["]'
            ),
            proxyAgreementInputs = agreementsPortal.locator(
                '.checkout-agreement input[type="checkbox"]'
            );
        await expect(proxyAgreementInputs).toHaveCount(await nativeAgreementInputs.count());
        if (await proxyAgreementInputs.count()) {
            for (let index = 0; index < await proxyAgreementInputs.count(); index += 1) {
                const nativeAgreement = nativeAgreementInputs.nth(index),
                    proxyAgreement = proxyAgreementInputs.nth(index);

                await expect(proxyAgreement).toBeVisible();
                await expect(proxyAgreement).not.toHaveAttribute('name', /.+/);
                await expect(proxyAgreement).not.toHaveAttribute('data-bind', /.+/);
                await expect(nativeAgreement).toHaveAttribute('name', /^agreement\[/);
                if (await proxyAgreement.getAttribute(
                    'data-fastcheckout-automatic-agreement'
                )) {
                    await expect(proxyAgreement).toBeDisabled();
                    await expect(proxyAgreement).toBeChecked();
                    await expect(nativeAgreement).toBeChecked();
                } else {
                    await expect(proxyAgreement).toBeEnabled();
                    const agreementField = proxyAgreement.locator('xpath=..'),
                        agreementText = agreementField.locator('label button.action-show'),
                        normalTextStyle = await agreementText.evaluate((button) => {
                            const style = getComputedStyle(button);

                            return [style.color, style.fontWeight];
                        });

                    await page.evaluate(() => {
                        window.require(
                            'Magento_CheckoutAgreements/js/model/agreement-validator'
                        ).validate();
                    });
                    await expect.poll(async () => {
                        const invalidTextStyle = await agreementText.evaluate((button) => {
                            const style = getComputedStyle(button);

                            return [style.color, style.fontWeight];
                        });

                        return invalidTextStyle[0] !== normalTextStyle[0] &&
                            Number(invalidTextStyle[1]) >= 700;
                    }).toBe(true);
                    expect(await agreementField.evaluate((field) => {
                        const message = field.querySelector('div.mage-error'),
                            messageStyle = getComputedStyle(message);

                        return messageStyle.position === 'absolute' &&
                            message.getBoundingClientRect().width <= 1;
                    })).toBe(true);
                    await proxyAgreement.check();
                    await expect(proxyAgreement).toBeChecked();
                    await expect(nativeAgreement).toBeChecked();
                    await expect(
                        agreementField.locator(':scope > div.mage-error')
                    ).toHaveCount(0);
                    await expect.poll(() => agreementText.evaluate((button) => {
                        const style = getComputedStyle(button);

                        return [style.color, style.fontWeight];
                    })).toEqual(normalTextStyle);
                }
            }

            await dismissConsent(page);
            const agreementAction = agreementsPortal.locator('button.action-show').first();
            await agreementAction.evaluate((button) => {
                button.scrollIntoView({block: 'center'});
            });
            await page.waitForTimeout(50);
            const agreementActionBox = await agreementAction.boundingBox();

            expect(agreementActionBox).not.toBeNull();
            expect(agreementActionBox.y).toBeGreaterThanOrEqual(0);
            expect(agreementActionBox.y + agreementActionBox.height)
                .toBeLessThanOrEqual(page.viewportSize().height);
            await page.mouse.click(
                agreementActionBox.x + agreementActionBox.width / 2,
                agreementActionBox.y + agreementActionBox.height / 2
            );
            const shownAgreementModal = page.locator('.agreements-modal._show').last();
            await expect(shownAgreementModal).toBeVisible();
            await expect(page.locator('.agreements-modal._show')).toHaveCount(1);
            expect(await shownAgreementModal.evaluate((modal) => {
                const wrapStyle = getComputedStyle(modal.querySelector('.modal-inner-wrap')),
                    headerStyle = getComputedStyle(modal.querySelector('.modal-header')),
                    footerStyle = getComputedStyle(modal.querySelector('.modal-footer'));

                return {
                    border: wrapStyle.borderWidth,
                    headerBorder: headerStyle.borderBottomWidth,
                    footerDisplay: footerStyle.display,
                    visibleButtons: Array.from(modal.querySelectorAll('button')).filter((button) => (
                        button.getClientRects().length > 0
                    )).length
                };
            })).toEqual({
                border: '0px',
                headerBorder: '0px',
                footerDisplay: 'none',
                visibleButtons: 1
            });
            const closeAgreementModal = shownAgreementModal.locator(
                '[data-role="closeBtn"], .action-close'
            ).first();
            await expect(closeAgreementModal).toHaveCount(1);
            expect(await closeAgreementModal.evaluate((button) => (
                getComputedStyle(button, '::before').content
            ))).not.toBe('none');
            await closeAgreementModal.evaluate((button) => button.click());
            await expect(page.locator('.agreements-modal:visible')).toHaveCount(0);
            await expect(page.locator('.modals-overlay')).toHaveCount(0);
            await expect(page.locator('body')).not.toHaveClass(/_has-modal/);
        }
        expect(await page.locator('[data-fastcheckout-place-order-ssr]').evaluate((button) => {
            const paymentCard = button.closest('[data-fastcheckout-payment-methods-card]');
            const agreementBlock = document.querySelector(
                    '.payment-method._active .checkout-agreements-block'
                ),
                agreementHost = document.querySelector(
                    '[data-fastcheckout-agreements-summary-host]'
                ),
                comment = document.querySelector('[data-fastcheckout-order-comment]');

            return {
                inPaymentCard: Boolean(paymentCard),
                inTotalsCard: Boolean(button.closest('[data-fastcheckout-totals-card]')),
                nativeOwnedByPayment: Boolean(agreementBlock),
                agreementsBeforeComment: Boolean(agreementHost && (!comment || (
                    agreementHost.compareDocumentPosition(comment) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                ))),
                agreementsBeforeButton: Boolean(agreementHost && (
                    agreementHost.compareDocumentPosition(button) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                ))
            };
        })).toEqual({
            inPaymentCard: false,
            inTotalsCard: true,
            nativeOwnedByPayment: true,
            agreementsBeforeComment: true,
            agreementsBeforeButton: true
        });
        await expect(page.locator('[data-fastcheckout-agreements-host]')).toHaveCount(0);

        const shippingInformationRoot = page.locator(
            '#fastcheckout-ko-shipping-information-root'
        );
        await expect(shippingInformationRoot).toHaveCount(1);
        await expect(shippingInformationRoot).toBeHidden();
        expect(await shippingInformationRoot.evaluate(() => {
            const component = window.require('uiRegistry').get('checkout.sidebar');

            return Boolean(component) &&
                typeof component.getRegion('shipping-information') === 'function';
        })).toBe(true);

        const paymentMethods = page.locator(
            '#checkout-payment-method-load .payment-method'
        );
        if (await paymentMethods.count() === 1) {
            const radio = paymentMethods.locator('input[name="payment[method]"]:checked');

            await expect(radio).toBeHidden();
            expect(await paymentMethods.locator('.payment-method-title').evaluate((title) => {
                const indicator = getComputedStyle(title, '::before');

                return indicator.content !== 'none' && parseFloat(indicator.width) > 0;
            })).toBe(true);
        }

        const paymentPresentation = await page.evaluate(() => {
            const methods = Array.from(document.querySelectorAll(
                    '.fastcheckout-ko-payment-root .payment-method'
                )),
                inactive = methods.filter((method) => !method.classList.contains('_active')),
                sample = inactive[0] || methods[0],
                sampleWasActive = sample && sample.classList.contains('_active'),
                toolbars = Array.from(document.querySelectorAll(
                    '.fastcheckout-ko-payment-root .payment-method .actions-toolbar'
                )),
                fields = Array.from(document.querySelectorAll(
                    '.fastcheckout-ko-payment-root .field'
                ));

            if (sampleWasActive) {
                sample.classList.remove('_active');
            }
            const inactiveOnlyTitles = Boolean(sample) &&
                Array.from(sample.children).filter((child) => (
                    getComputedStyle(child).display !== 'none'
                )).every((child) => child.classList.contains('payment-method-title'));
            if (sampleWasActive) {
                sample.classList.add('_active');
            }

            return {
                inactiveOnlyTitles,
                toolbarCount: toolbars.length,
                nativeButtonsHidden: Array.from(document.querySelectorAll(
                    '.fastcheckout-native-place-order-btn'
                )).every((button) => (
                    getComputedStyle(button).display === 'none'
                )),
                noLegacyFieldMargin: fields.every((field) => (
                    getComputedStyle(field).marginBottom !== '28px'
                ))
            };
        });
        expect(paymentPresentation.toolbarCount).toBeGreaterThan(0);
        expect(paymentPresentation.inactiveOnlyTitles).toBe(true);
        expect(paymentPresentation.nativeButtonsHidden).toBe(true);
        expect(paymentPresentation.noLegacyFieldMargin).toBe(true);

        const rendererState = await page.evaluate(() => new Promise((resolve, reject) => {
            window.require([
                'Magento_Checkout/js/model/payment/renderer-list',
                'Magento_Checkout/js/model/payment/method-list'
            ], (renderers, methods) => resolve({
                rendererCount: renderers().length,
                rendererComponents: renderers().map((renderer) => renderer.component || ''),
                methodCodes: methods().map((method) => method.method)
            }), reject);
        }));

        expect(rendererState.rendererCount).toBeGreaterThan(0);
        expect(rendererState.rendererComponents.some((component) => (
            component.startsWith('Mollie_Payment/') ||
            component.startsWith('PayPal_Braintree/')
        ))).toBe(true);
        expect(rendererState.methodCodes).toContain('purchaseorder');
        await expect(page.locator('[data-fastcheckout-payment-method-ko-target]'))
            .toHaveCount(0);

        const purchaseOrderMethod = page.locator(
            'input[name="payment[method]"][value="purchaseorder"]'
        );
        await expect(purchaseOrderMethod).toHaveCount(1);
        await purchaseOrderMethod.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
        ))).toBe('purchaseorder');

        const nativeButton = page.locator(
            '.payment-method._active .payment-method-content .action.checkout'
        );
        await expect(nativeButton).toHaveCount(1);
        await expect(nativeButton).toBeHidden();
        const nativeToolbar = nativeButton.locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " actions-toolbar ")][1]'
        );
        await nativeToolbar.evaluate((toolbar) => {
            const secondary = document.createElement('button');

            secondary.type = 'button';
            secondary.dataset.fastcheckoutE2eSecondaryAction = '1';
            secondary.textContent = 'Use new card';
            toolbar.appendChild(secondary);
        });
        await expect(page.locator('[data-fastcheckout-e2e-secondary-action]')).toBeVisible();

        const sameAsShipping = page.locator(
            '.payment-method._active input[name="billing-address-same-as-shipping"], ' +
            '.fastcheckout-payment-after-methods ' +
            'input[name="billing-address-same-as-shipping"]'
        ).first();
        await expect(sameAsShipping).toBeChecked();
        await page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote'),
                marker = document.createElement('i');

            quote.billingAddress(null);
            document.getElementById('fastcheckout-checkout').appendChild(marker);
            marker.remove();
        });
        await expect(sameAsShipping).toBeChecked();
        await expect.poll(() => page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote'),
                billing = quote.billingAddress(),
                shipping = quote.shippingAddress();

            return Boolean(billing && shipping &&
                billing.getCacheKey() === shipping.getCacheKey());
        })).toBe(true);
        await sameAsShipping.click({force: true});
        await expect(sameAsShipping).not.toBeChecked();
        const billingFieldset = page.locator(
            '.payment-method._active .checkout-billing-address ' +
            '[data-form="billing-new-address"]:visible, ' +
            '.fastcheckout-payment-after-methods .checkout-billing-address ' +
            '[data-form="billing-new-address"]:visible'
        ).first();
        await expect(billingFieldset).toBeVisible();
        expect(await billingFieldset.evaluate((fieldset) => {
            const billing = fieldset.closest('.checkout-billing-address'),
                card = document.querySelector('.fc-container-1 > .card');

            if (billing.closest('.payment-method')) {
                return true;
            }

            const billingStyle = getComputedStyle(billing),
                cardStyle = getComputedStyle(card);

            return [
                'backgroundColor', 'borderTopColor', 'borderTopWidth',
                'borderRadius', 'paddingTop', 'paddingRight'
            ].every((property) => billingStyle[property] === cardStyle[property]);
        })).toBe(true);
        const billingLayout = await billingFieldset.evaluate((fieldset) => {
            const box = fieldset.getBoundingClientRect();
            const style = getComputedStyle(fieldset);
            const firstName = fieldset.querySelector('input[name="firstname"]')
                ?.closest('.field, .admin__field')?.getBoundingClientRect();
            const lastName = fieldset.querySelector('input[name="lastname"]')
                ?.closest('.field, .admin__field')?.getBoundingClientRect();

            return {
                display: style.display,
                insidePaymentHost: Boolean(fieldset.closest(
                    '[data-fastcheckout-payment-methods-card], ' +
                    '.fastcheckout-payment-after-methods'
                )),
                noHorizontalOverflow: fieldset.scrollWidth <= Math.ceil(box.width),
                firstRowHasTwoFields: Boolean(firstName && lastName &&
                    Math.abs(firstName.top - lastName.top) < 2 &&
                    lastName.left > firstName.right),
                inputWidth: fieldset.querySelector('input[name="firstname"]')
                    ?.getBoundingClientRect().width || 0
            };
        });
        expect(billingLayout).toEqual({
            display: 'grid',
            insidePaymentHost: true,
            noHorizontalOverflow: true,
            firstRowHasTwoFields: true,
            inputWidth: expect.any(Number)
        });
        expect(billingLayout.inputWidth).toBeGreaterThan(150);
        await sameAsShipping.click({force: true});
        await expect(sameAsShipping).toBeChecked();

        const proxy = page.locator('[data-fastcheckout-place-order-ssr]');
        await expect(proxy).toBeVisible();
        await expect(proxy).toBeEnabled();
        const proxyLabel = proxy.locator('[data-fastcheckout-place-order-label]'),
            readyText = await proxyLabel.getAttribute('data-fastcheckout-ready-text'),
            processingText = await proxyLabel.getAttribute(
                'data-fastcheckout-processing-text'
            );
        await page.evaluate(() => document.dispatchEvent(
            new Event('fastcheckout:order-submit-started')
        ));
        await expect(proxy).toBeDisabled();
        await expect(proxy).toHaveAttribute('aria-busy', 'true');
        await expect(proxyLabel).toHaveText(processingText);
        await expect(proxy.locator('[data-fastcheckout-place-order-spinner]')).toBeVisible();
        await page.evaluate(() => document.dispatchEvent(
            new Event('fastcheckout:order-submit-failed')
        ));
        await expect(proxy).toBeEnabled();
        await expect(proxy).not.toHaveAttribute('aria-busy');
        await expect(proxyLabel).toHaveText(readyText);
        await expect(proxy.locator('[data-fastcheckout-place-order-spinner]')).toBeHidden();
        const clickProxy = async () => {
            await dismissConsent(page);
            await proxy.click({force: true});
        };

        const addressValidationField = shippingRoot.locator('input[name="firstname"]');
        const purchaseOrderNumber = page.locator('input[name="payment[po_number]"]');
        const visibleErrorText = (field) => field.evaluate((input) => {
            const wrapper = input.closest('.field') || input.parentElement;

            return Array.from(wrapper.querySelectorAll(
                '.field-error, .mage-error:not(input):not(select):not(textarea), [id$="-error"]'
            )).filter((message) => {
                const style = window.getComputedStyle(message);

                return message.textContent.trim() && style.display !== 'none' &&
                    style.visibility !== 'hidden' && message.getClientRects().length;
            }).map((message) => message.textContent.trim());
        });
        await expect(purchaseOrderNumber).toBeVisible();
        await purchaseOrderNumber.fill('FC-E2E-' + Date.now());
        await purchaseOrderNumber.blur();

        await addressValidationField.fill('');
        await proxy.evaluate((button) => button.scrollIntoView({block: 'center'}));
        await page.waitForTimeout(50);
        const addressWasVisible = await addressValidationField.evaluate((input) => {
            const box = input.getBoundingClientRect();

            return box.top >= 0 && box.bottom <= window.innerHeight;
        });
        await page.evaluate(() => {
            window.fastcheckoutE2eAddressScroll = [window.scrollY];
            const sampler = window.setInterval(() => {
                window.fastcheckoutE2eAddressScroll.push(window.scrollY);
            }, 16);

            window.setTimeout(() => {
                window.clearInterval(sampler);
                window.fastcheckoutE2eAddressScrollDone = true;
            }, 2_000);
        });
        await clickProxy();
        await expect.poll(() => visibleErrorText(addressValidationField)).not.toEqual([]);
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutE2eAddressScrollDone
        ))).toBe(true);
        if (!addressWasVisible) {
            expect(new Set((await page.evaluate(() => (
                window.fastcheckoutE2eAddressScroll
            ))).map(Math.round)).size).toBeGreaterThan(2);
        }
        expect(paymentRequests).toBe(0);
        await addressValidationField.fill('Jan');
        await addressValidationField.blur();
        await expect.poll(() => visibleErrorText(addressValidationField)).toEqual([]);
        await expect(sameAsShipping).toBeChecked();
        await expect.poll(() => page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote'),
                billing = quote.billingAddress(),
                shipping = quote.shippingAddress();

            return Boolean(billing && shipping &&
                billing.getCacheKey() === shipping.getCacheKey());
        })).toBe(true);
        await expect.poll(() => nativeButton.isEnabled()).toBe(true);

        await purchaseOrderNumber.fill('');
        await purchaseOrderNumber.blur();
        await clickProxy();
        await expect.poll(() => visibleErrorText(purchaseOrderNumber)).not.toEqual([]);
        expect(paymentRequests).toBe(0);
        await purchaseOrderNumber.fill('FC-E2E-' + Date.now());
        await purchaseOrderNumber.blur();
        await purchaseOrderNumber.evaluate((input) => window.jQuery(input).valid());
        await expect.poll(() => visibleErrorText(purchaseOrderNumber)).toEqual([]);

        await page.evaluate(() => new Promise((resolve, reject) => {
            window.require([
                'Magento_Checkout/js/model/payment/additional-validators'
            ], (validators) => {
                window.fastcheckoutE2eAllowOrder = false;
                window.fastcheckoutE2eValidationCalls = 0;
                validators.registerValidator({
                    validate: () => {
                        window.fastcheckoutE2eValidationCalls += 1;
                        return window.fastcheckoutE2eAllowOrder;
                    }
                });
                resolve();
            }, reject);
        }));
        await expect(sameAsShipping).toBeChecked();
        await expect.poll(() => page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote'),
                billing = quote.billingAddress(),
                shipping = quote.shippingAddress();

            return Boolean(billing && shipping &&
                billing.getCacheKey() === shipping.getCacheKey());
        })).toBe(true);
        await clickProxy();
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutE2eValidationCalls
        ))).toBe(1);
        await expect(sameAsShipping).toBeChecked();
        await page.evaluate(() => {
            const error = document.createElement('p');

            error.className = 'msg msg__error';
            error.dataset.fastcheckoutE2ePaymentError = '1';
            error.textContent = 'Payment validation error';
            document.querySelector('.payment-method._active .payment-method-content')
                .appendChild(error);
        });
        const paymentError = page.locator('[data-fastcheckout-e2e-payment-error]');
        await expect(paymentError).toBeVisible();
        await expect.poll(() => paymentError.evaluate((error) => {
            const box = error.getBoundingClientRect();

            return box.top >= 0 && box.bottom <= window.innerHeight;
        })).toBe(true);
        await paymentError.evaluate((error) => {
            error.remove();
        });
        await expect.poll(() => visibleErrorText(purchaseOrderNumber)).toEqual([]);
        expect(paymentRequests).toBe(0);
        expect(pageErrors.filter((message) => (
            message.includes('requirejs is not defined') ||
            message.includes("Cannot read properties of undefined (reading 'set')")
        ))).toEqual([]);

        if (process.env.FC_ALLOW_PLACE_ORDER !== '1') {
            await page.reload({waitUntil: 'domcontentloaded'});
            await expect(page.locator('#checkout > #fastcheckout-checkout'))
                .toBeVisible({timeout: 45_000});
            await expect.poll(() => page.evaluate(() => (
                window.require.defined('Magento_Checkout/js/model/payment-service')
                    ? window.require('Magento_Checkout/js/model/payment-service')
                        .getAvailablePaymentMethods().length
                    : 0
            )), {timeout: 45_000}).toBeGreaterThan(0);
            const reloadedPurchaseOrder = page.locator(
                'input[name="payment[method]"][value="purchaseorder"]'
            );
            await expect(reloadedPurchaseOrder).toHaveCount(1, {timeout: 45_000});
            await reloadedPurchaseOrder.evaluate((input) => input.click());
            await expect.poll(() => page.evaluate(() => (
                window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
            ))).toBe('purchaseorder');
            await expect.poll(() => page.evaluate(() => {
                const quote = window.require('Magento_Checkout/js/model/quote'),
                    input = Array.from(document.querySelectorAll(
                        'input[name="billing-address-same-as-shipping"]'
                    )).find((candidate) => candidate.getClientRects().length),
                    component = input && window.require('ko').dataFor(
                        input.closest('.checkout-billing-address')
                    ),
                    billing = quote.billingAddress(),
                    shipping = quote.shippingAddress();

                return {
                    modelSame: Boolean(billing && shipping &&
                        billing.getCacheKey() === shipping.getCacheKey()),
                    componentSame: Boolean(component &&
                        component.isAddressSameAsShipping()),
                    checked: Boolean(input && input.checked)
                };
            }), {timeout: 10_000}).toEqual({
                modelSame: true,
                componentSame: true,
                checked: true
            });
            return;
        }

        expect(await page.evaluate(() => (
            window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
        ))).toBe('purchaseorder');

        await page.evaluate(() => {
            window.fastcheckoutE2eAllowOrder = true;
            const staleError = document.createElement('p');

            staleError.className = 'msg__error';
            staleError.dataset.fastcheckoutE2eStaleError = '1';
            staleError.textContent = 'Previous validation error';
            document.querySelector('.payment-method._active .payment-method-content')
                .prepend(staleError);
        });
        await page.route('**/payment-information*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            await route.continue();
        });
        await page.evaluate(() => new Promise((resolve, reject) => {
            const request = window.require(
                'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator'
            ).ensureSaved();

            request.done(resolve).fail(reject);
        }));
        const paymentRequestStarted = page.waitForRequest((request) => (
            request.method() === 'POST' &&
            request.url().includes('/payment-information')
        ), {timeout: 60_000});
        await proxy.evaluate((button) => button.scrollIntoView({block: 'center'}));
        await page.waitForTimeout(50);
        const scrollBeforeSubmit = await page.evaluate(() => window.scrollY);
        const placeOrderResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/payment-information')
        ), {timeout: 60_000});
        placeOrderRequests = [];
        await clickProxy();
        const paymentRequest = await paymentRequestStarted;
        const paymentPayload = paymentRequest.postDataJSON();
        const submittedPayment = paymentPayload.paymentMethod || paymentPayload.payment_method;
        const submittedAdditional = submittedPayment.additional_data || {};
        expect(submittedPayment.extension_attributes).toMatchObject({
            comment: 'Fastcheckout provider comment',
            subscribe: false
        });
        expect(submittedAdditional.fastcheckout_comment).toBeUndefined();
        expect(submittedAdditional.fastcheckout_subscribe).toBeUndefined();
        await page.waitForTimeout(350);
        expect(Math.abs(
            await page.evaluate(() => window.scrollY) - scrollBeforeSubmit
        )).toBeLessThanOrEqual(2);
        const orderResponse = await placeOrderResponse;
        expect(orderResponse.ok()).toBe(true);
        await page.waitForURL(/checkout\/onepage\/success/, {timeout: 60_000});
        await expect(page.locator('.fastcheckout-success-card')).toBeVisible();
        expect(placeOrderRequests.filter((url) => (
            url.includes('/estimate-shipping-methods')
        ))).toHaveLength(0);
        expect(placeOrderRequests.filter((url) => (
            url.includes('/shipping-information')
        ))).toHaveLength(0);
        expect(placeOrderRequests.filter((url) => (
            /\/payment-information(?:\?|$)/.test(url)
        ))).toHaveLength(1);
    });
});

test.describe('Fastcheckout Furgonetka pickup placement', () => {
    test.skip(EXPECT_TWO_STEP, 'Pickup placement is verified in the default one-step mode.');

    test('restores a saved pickup point inside the selected shipping method', async ({page}) => {
        test.setTimeout(150_000);
        await openCheckoutWithProduct(page);
        const hasFurgonetkaConfig = await page.evaluate(() => (
            (window.checkoutConfig.FurgonetkaPl?.mapConfiguration || []).length > 0
        ));

        test.skip(
            !hasFurgonetkaConfig,
            'Furgonetka pickup-point checkout component is not configured.'
        );
        await fillShippingAddress(page, 'pickup-reload');

        const rates = page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
        );
        await expect.poll(() => rates.count(), {timeout: 45_000}).toBeGreaterThan(0);
        const pickupRateValue = await rates.evaluateAll((inputs) => {
            const configured = (window.checkoutConfig.FurgonetkaPl?.mapConfiguration || [])
                .flatMap((entry) => entry.ids || [])
                .map((id) => id.replace(':', '_'));

            return inputs.map((input) => input.value).find((value) => (
                configured.includes(value)
            )) || '';
        });
        test.skip(
            !pickupRateValue,
            'No configured Furgonetka pickup rate is available for the address.'
        );

        const shippingResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), {timeout: 45_000});
        await page.locator(
            `input[name="shipping_method"][value="${pickupRateValue}"]`
        ).click({force: true});
        expect((await shippingResponse).ok()).toBe(true);

        await expect.poll(() => page.evaluate(() => {
            const method = window.require('Magento_Checkout/js/model/quote').shippingMethod(),
                placement = document.querySelector('.fastcheckout-furgonetkapl-placement');

            return Boolean(method && placement && placement.parentElement &&
                placement.parentElement.id ===
                'label_method_' + method.method_code + '_' + method.carrier_code + '_additional');
        }), {timeout: 25_000}).toBe(true);

        const savedPointName = 'Fastcheckout E2E point ' + Date.now();
        const savePointResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/furgonetkapl/pickup-point/save')
        ), {timeout: 30_000});
        expect(await page.evaluate((pointName) => {
            const component = window.require('uiRegistry').filter((item) => (
                    typeof item.savePickupPoint === 'function' &&
                    typeof item.findMapConfigEntry === 'function'
                ))[0],
                quote = window.require('Magento_Checkout/js/model/quote'),
                method = quote.shippingMethod(),
                config = component.findMapConfigEntry(method);

            component.savePickupPoint(
                quote.getQuoteId(),
                method.carrier_code,
                method.method_code,
                'FASTCHECKOUT-E2E',
                pointName,
                config.courierService
            );

            return true;
        }, savedPointName)).toBe(true);
        expect((await savePointResponse).ok()).toBe(true);
        await expect(page.locator(
            '.fastcheckout-furgonetkapl-placement .selected-point-info'
        )).toContainText(savedPointName);

        await page.reload({waitUntil: 'domcontentloaded', timeout: 60_000});
        await expect(page.locator('#fastcheckout-checkout')).toBeVisible({timeout: 45_000});
        await expect.poll(() => page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
        ).count(), {timeout: 45_000}).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate((pointName) => {
            const method = window.require('Magento_Checkout/js/model/quote').shippingMethod(),
                placement = document.querySelector('.fastcheckout-furgonetkapl-placement'),
                selected = placement && placement.querySelector('.selected-point-info');

            return Boolean(method && placement && selected &&
                selected.textContent.includes(pointName) &&
                placement.parentElement.id ===
                'label_method_' + method.method_code + '_' + method.carrier_code + '_additional' &&
                placement.closest('.fastcheckout-shipping-method-option'));
        }, savedPointName), {timeout: 25_000}).toBe(true);
        await expect(page.locator('#fastcheckout-ko-shipping-information-root')).toBeHidden();
    });
});

test.describe('Fastcheckout native Magento two-step flow', () => {
    test.skip(!EXPECT_TWO_STEP, 'Enable with FC_EXPECT_TWO_STEP=1.');

    test('uses Magento shipping save and step navigation exactly once', async ({page}) => {
        test.setTimeout(180_000);
        const {pageErrors} = await openCheckoutWithProduct(page);

        const root = page.locator('#fastcheckout-checkout');
        const shippingRoot = page.locator('.fastcheckout-native-shipping-address');
        const paymentStep = page.locator('[data-fastcheckout-payment-step]');
        const summary = page.locator('.fc-container-4');
        const placeOrder = page.locator('[data-fastcheckout-place-order-ssr]');
        const next = page.locator('[data-fastcheckout-next-step]');

        await expect(root).toHaveAttribute('data-fastcheckout-mode', 'two-step');
        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'shipping');
        await expect(page.locator('.fastcheckout-progress .opc-progress-bar')).toBeVisible();
        await expect(shippingRoot).toBeVisible();
        await expect(paymentStep).toBeHidden();
        await expect(summary).toBeVisible();
        await expect(placeOrder).toBeHidden();
        await expect(next).toBeVisible();
        await expect(next).toBeEnabled();
        await page.setViewportSize({width: 390, height: 844});
        const mobileNext = page.locator('[data-fastcheckout-next-step-mobile]');
        const mobileStickyInfo = page.locator('[data-fastcheckout-mobile-sticky-info]');
        await expect(mobileNext).toBeVisible();
        await expect(mobileNext).toBeEnabled();
        await expect(mobileStickyInfo).toBeHidden();
        expect(await page.evaluate(() => (
            window.checkoutConfig.fastcheckoutSettings.twoStep
        ))).toBe(true);

        let shippingRequests = 0;

        page.on('request', (request) => {
            if (request.method() === 'POST' &&
                request.url().includes('/shipping-information')) {
                shippingRequests += 1;
            }
        });
        const startScrollSample = async (position) => page.evaluate((requestedPosition) => {
            const scroller = document.scrollingElement,
                previousBehavior = scroller.style.scrollBehavior;

            if (requestedPosition) {
                scroller.style.scrollBehavior = 'auto';
                window.scrollTo(0, requestedPosition === 'bottom' ? scroller.scrollHeight : 0);
                scroller.style.scrollBehavior = previousBehavior;
            }
            window.fastcheckoutE2eTwoStepScroll = [window.scrollY];
            window.fastcheckoutE2eTwoStepScrollDone = false;
            const sampler = window.setInterval(() => {
                window.fastcheckoutE2eTwoStepScroll.push(window.scrollY);
            }, 16);

            window.setTimeout(() => {
                window.clearInterval(sampler);
                window.fastcheckoutE2eTwoStepScrollDone = true;
            }, 1_000);
        }, position);
        const expectSmoothScroll = async (error, shouldMove = true) => {
            await expect.poll(() => error.evaluate((element) => {
                const box = element.getBoundingClientRect();

                return box.top >= 0 && box.bottom <= window.innerHeight;
            })).toBe(true);
            await expect.poll(() => page.evaluate(() => (
                window.fastcheckoutE2eTwoStepScrollDone
            ))).toBe(true);
            if (shouldMove) {
                expect(new Set((await page.evaluate(() => (
                    window.fastcheckoutE2eTwoStepScroll
                ))).map(Math.round)).size).toBeGreaterThan(2);
            }
        };

        await page.evaluate(() => {
            window.require('Magento_Checkout/js/model/quote').shippingMethod(null);
        });
        await startScrollSample('bottom');
        await mobileNext.evaluate((button) => button.click());
        const firstName = shippingRoot.locator('input[name="firstname"]');
        const firstNameError = firstName.locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field ")][1]' +
            '//*[contains(@class, "mage-error") or contains(@class, "field-error")]'
        ).first();
        const emailError = shippingRoot.locator('input[name="username"]').locator(
            'xpath=ancestor::form[1]//*[contains(@class, "mage-error") or ' +
            'contains(@class, "field-error")]'
        ).first();
        await expect(firstName).toHaveAttribute('aria-invalid', 'true');
        await expect(firstNameError).toBeVisible();
        await expect(emailError).toBeVisible();
        await expect(page.locator('[data-fastcheckout-shipping-method-error]')).toBeHidden();
        await expectSmoothScroll(emailError);
        expect(shippingRequests).toBe(0);

        await fillShippingAddress(page, 'two-step');
        const rates = page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
        );
        await expect.poll(() => rates.count(), {timeout: 45_000}).toBeGreaterThan(0);
        await startScrollSample('top');
        await mobileNext.evaluate((button) => button.click());
        const shippingMethodError = page.locator(
            '#checkout-step-shipping_method [data-fastcheckout-shipping-method-error]'
        );
        await expect(shippingMethodError).toBeVisible();
        await expectSmoothScroll(shippingMethodError);
        expect(shippingRequests).toBe(0);
        const regularRateIndex = await rates.evaluateAll((inputs) => {
            const purchaseOrderRate = inputs.findIndex((input) => (
                input.value === 'tablerate_bestway'
            ));

            return purchaseOrderRate >= 0 ? purchaseOrderRate : inputs.findIndex((input) => (
                !/(?:inpost|locker|pickup)/i.test(input.value)
            ));
        });
        const selectedRate = rates.nth(regularRateIndex >= 0 ? regularRateIndex : 0);
        await selectedRate.click({force: true});
        await expect(shippingMethodError).toBeHidden();
        await page.waitForTimeout(300);
        expect(shippingRequests).toBe(0);

        await expect(next).toBeHidden();
        await expect(mobileNext).toBeVisible();
        await expect(mobileNext).toBeEnabled();
        const shippingResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), {timeout: 60_000});
        await mobileNext.click({force: true});
        expect((await shippingResponse).ok()).toBe(true);
        expect(shippingRequests).toBe(1);

        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'payment');
        await expect(shippingRoot).toBeHidden();
        await expect(paymentStep).toBeVisible();
        await expect(summary).toBeVisible();
        await expect(mobileNext).toBeHidden();
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeVisible();
        await expect(mobileStickyInfo).toBeVisible();
        await page.setViewportSize({width: 1440, height: 900});
        await expect(placeOrder).toBeVisible();
        expect(await page.locator('.fc-right-wrapper').evaluate((wrapper) => {
            const payment = wrapper.firstElementChild.getBoundingClientRect(),
                summaryColumn = wrapper.lastElementChild.getBoundingClientRect();

            return Math.abs(payment.width / (payment.width + summaryColumn.width) - 0.6) < 0.01;
        })).toBe(true);
        await expect(summary.locator('[data-fastcheckout-order-actions]')).toHaveCount(0);
        await expect(summary.locator('[data-fastcheckout-order-comment]')).toHaveCount(0);
        await expect(summary.locator('[data-fastcheckout-place-order-ssr]')).toHaveCount(0);
        await expect(paymentStep.locator('[data-fastcheckout-order-actions]')).toBeVisible();
        const shippingInformation = summary.locator(
            '[data-fastcheckout-shipping-information] .shipping-information'
        );
        await expect(shippingInformation).toBeVisible();
        expect(await shippingInformation.evaluate((information) => {
            const blocks = Array.from(information.querySelectorAll('.ship-to, .ship-via'));

            return blocks.every((block) => {
                const title = block.querySelector('.shipping-information-title')
                        .getBoundingClientRect(),
                    content = block.querySelector('.shipping-information-content')
                        .getBoundingClientRect();

                return content.left > title.right &&
                    Math.abs(content.width / (title.width + content.width) - 0.65) < 0.01;
            });
        })).toBe(true);
        const editShippingInformation = shippingInformation.locator('.action-edit').first();
        await expect(editShippingInformation).toBeVisible();
        expect(await editShippingInformation.evaluate((button) => {
            const style = getComputedStyle(button),
                secondaryStyle = getComputedStyle(document.querySelector('.btn.btn-secondary'));

            return parseFloat(style.paddingTop) > 0 &&
                parseFloat(style.paddingLeft) > 0 &&
                parseFloat(style.borderRadius) > 0 &&
                style.backgroundColor === secondaryStyle.backgroundColor &&
                style.borderColor === secondaryStyle.borderColor &&
                style.color === secondaryStyle.color &&
                style.getPropertyValue('--btn-hover-bg') ===
                    secondaryStyle.getPropertyValue('--btn-hover-bg');
        })).toBe(true);
        await expect.poll(() => page.locator(
            '#checkout-payment-method-load .payment-method'
        ).count(), {timeout: 45_000}).toBeGreaterThan(0);

        const purchaseOrder = page.locator(
            'input[name="payment[method]"][value="purchaseorder"]'
        );
        await expect(purchaseOrder).toHaveCount(1);
        await purchaseOrder.evaluate((input) => input.click());
        await expect.poll(() => page.evaluate(() => (
            window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
        ))).toBe('purchaseorder');

        const agreements = paymentStep.locator(
            '[data-fastcheckout-agreements-summary-host] > .checkout-agreements-block'
        );
        if (await agreements.count()) {
            await expect(agreements).toBeVisible();
            expect(await agreements.evaluate((block) => {
                const style = getComputedStyle(block);

                return [style.borderTopWidth, style.paddingTop];
            })).toEqual(['0px', '0px']);
        }

        const purchaseOrderNumber = page.locator('input[name="payment[po_number]"]');
        await expect(purchaseOrderNumber).toBeVisible();
        await placeOrder.evaluate((button) => button.scrollIntoView({block: 'center'}));
        const purchaseOrderWasVisible = await purchaseOrderNumber.evaluate((input) => {
            const box = input.getBoundingClientRect();

            return box.top >= 0 && box.bottom <= window.innerHeight;
        });
        await page.evaluate(() => {
            window.fastcheckoutE2eNativeFocus = HTMLElement.prototype.focus;
            window.fastcheckoutE2ePaymentFocusOptions = [];
            HTMLElement.prototype.focus = function (options) {
                if (this.name === 'payment[po_number]') {
                    window.fastcheckoutE2ePaymentFocusOptions.push(Boolean(
                        options && options.preventScroll
                    ));
                }

                return window.fastcheckoutE2eNativeFocus.apply(this, arguments);
            };
        });
        await startScrollSample(null);
        await placeOrder.click({force: true});
        const purchaseOrderError = purchaseOrderNumber.locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " field ")][1]' +
            '//*[contains(@class, "mage-error") or contains(@class, "field-error")]'
        ).first();
        await expect(purchaseOrderError).toBeVisible();
        expect(await page.evaluate(() => (
            window.require('jquery')('html, body').is(':animated')
        ))).toBe(false);
        expect(await page.evaluate(() => window.fastcheckoutE2ePaymentFocusOptions))
            .toContain(true);
        await expectSmoothScroll(purchaseOrderError, !purchaseOrderWasVisible);
        await page.evaluate(() => {
            HTMLElement.prototype.focus = window.fastcheckoutE2eNativeFocus;
            delete window.fastcheckoutE2eNativeFocus;
        });
        await purchaseOrderNumber.fill('FC-E2E');
        await purchaseOrderNumber.blur();

        expect(await page.evaluate(() => window.location.hash)).toBe('#payment');

        await page.locator(
            '.fastcheckout-progress .opc-progress-bar-item._complete > span'
        ).first().evaluate((step) => step.click());
        await expect(root).toHaveAttribute('data-fastcheckout-active-step', 'shipping');
        await expect(shippingRoot).toBeVisible();
        await expect(paymentStep).toBeHidden();
        await expect(placeOrder).toBeHidden();
        expect(pageErrors).toEqual([]);
    });
});
