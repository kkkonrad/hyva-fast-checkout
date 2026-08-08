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

async function openCheckoutWithProduct(page) {
    const pageErrors = [];

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

test.describe('Fastcheckout native Magento compatibility host', () => {
    test('keeps the Fastcheckout presentation and canonical component tree', async ({page}) => {
        test.setTimeout(150_000);
        const assetFailures = [];

        page.on('response', (response) => {
            if (page.url().includes('/checkout/') && response.status() >= 400 &&
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
        await expect(nativeSummary.locator('.table-totals tr.grand.totals')).toBeVisible();
        await expect(page.locator('[data-fastcheckout-summary-ssr]')).toBeHidden();
        expect(await page.evaluate(() => {
            const quote = window.require('Magento_Checkout/js/model/quote');
            const billing = quote.billingAddress();
            const shipping = quote.shippingAddress();

            return Boolean(billing && shipping &&
                billing.getCacheKey() === shipping.getCacheKey());
        })).toBe(true);
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
                hyvaAssets: Array.from(document.querySelectorAll('link[href], script[src]'))
                    .some((node) => (node.href || node.src || '').includes('/Hyva/default/')),
                lumaAssets: Array.from(document.querySelectorAll('link[href], script[src]'))
                    .some((node) => (node.href || node.src || '').includes('/Magento/luma/')),
                noFallbackNotice: !document.body.textContent.includes('No Checkout module installed.'),
                noAuthenticationChrome:
                    !document.querySelector('#fastcheckout-checkout .authentication-wrapper'),
                shippingAdditional: typeof shipping.getRegion('shippingAdditional') === 'function',
                beforeShippingForm:
                    typeof shipping.getRegion('before-shipping-method-form') === 'function',
                beforeMethods: typeof payment.getRegion('beforeMethods') === 'function',
                afterMethods: typeof payment.getRegion('afterMethods') === 'function'
            };
        });

        expect(geometry).toEqual({
            twoColumns: true,
            hyvaAssets: true,
            lumaAssets: false,
            noFallbackNotice: true,
            noAuthenticationChrome: true,
            shippingAdditional: true,
            beforeShippingForm: true,
            beforeMethods: true,
            afterMethods: true
        });
        await page.setViewportSize({width: 390, height: 844});
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeVisible();
        await expect(page.locator('[data-fastcheckout-place-order-mobile]')).toBeEnabled();
        expect(assetFailures, assetFailures.join('\n')).toEqual([]);
    });

    test('validates shipping and Purchase Order, optionally placing an order', async ({page}) => {
        test.setTimeout(180_000);
        const {hasInPost, pageErrors} = await openCheckoutWithProduct(page);
        const shippingRoot = page.locator('.fastcheckout-native-shipping-address');
        await expect(shippingRoot.locator('input[name="firstname"]'))
            .toBeVisible({timeout: 45_000});
        let paymentRequests = 0;
        page.on('request', (request) => {
            if (request.method() === 'POST' && request.url().includes('/payment-information')) {
                paymentRequests += 1;
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
        await expect(page.locator('[data-fastcheckout-shipping-method-error]')).toBeVisible();
        await expect(page.locator('[data-fastcheckout-client-order-error]:visible'))
            .toContainText('Brakuje metody płatności. Wybierz metodę płatności i spróbuj ponownie.');
        expect(paymentRequests).toBe(0);

        await shippingRoot.locator('input[name="username"]').fill(
            'compat-' + Date.now() + '@example.com'
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

        const rates = page.locator(
            '#fastcheckout-ko-shipping-root input[name="shipping_method"]'
        );
        await expect.poll(() => rates.count(), {timeout: 45_000}).toBeGreaterThan(0);

        if (hasInPost) {
            const inPostRate = page.locator(
                '#fastcheckout-ko-shipping-root ' +
                'input[name="shipping_method"][value*="inpostlocker"]'
            ).first();

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
            const selectPoint = page.locator(
                '[data-inpost-wrapper] [data-inpost-select-point]'
            ).first();

            await expect(selectPoint).toBeVisible({timeout: 25_000});
            await selectPoint.evaluate((button) => button.click());
            await expect(page.locator('[data-inpost-modal] inpost-geowidget')).toBeVisible();
            await page.locator('[data-inpost-modal-btn-close]').evaluate((button) => (
                button.click()
            ));
            await expect(page.locator('[data-inpost-modal]')).toHaveCount(0);
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
        const shippingResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/shipping-information')
        ), {timeout: 45_000});
        await selected.click({force: true});
        expect((await shippingResponse).ok()).toBe(true);
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
        const agreementsHost = page.locator('[data-fastcheckout-agreements-host]');
        await expect(agreementsHost.locator('.checkout-agreements-block')).toHaveCount(1);
        expect(await agreementsHost.evaluate((host) => (
            host.matches('.payment-method._active') &&
            host.previousElementSibling?.matches('[data-fastcheckout-newsletter]')
        ))).toBe(true);

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
                toolbarsHidden: toolbars.every((toolbar) => (
                    getComputedStyle(toolbar).display === 'none'
                )),
                noLegacyFieldMargin: fields.every((field) => (
                    getComputedStyle(field).marginBottom !== '28px'
                ))
            };
        });
        expect(paymentPresentation.toolbarCount).toBeGreaterThan(0);
        expect(paymentPresentation.inactiveOnlyTitles).toBe(true);
        expect(paymentPresentation.toolbarsHidden).toBe(true);
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
        await expect(page.locator(
            '[data-fastcheckout-payment-option], [data-fastcheckout-payment-method-ko-target]'
        )).toHaveCount(0);

        const nativeButton = page.locator(
            '.payment-method._active .payment-method-content .action.checkout'
        );
        await expect(nativeButton).toHaveCount(1);
        await expect(page.locator('#fastcheckout-place-order-host .actions-toolbar')).toHaveCount(0);

        const sameAsShipping = page.locator(
            'input[name="billing-address-same-as-shipping"]'
        );
        await expect(sameAsShipping).toBeChecked();
        await sameAsShipping.uncheck({force: true});
        const billingAddress = page.locator(
            '.payment-method._active .checkout-billing-address'
        );
        const billingFieldset = billingAddress.locator('[data-form="billing-new-address"]');
        await expect(billingFieldset).toBeVisible();
        const billingLayout = await billingFieldset.evaluate((fieldset) => {
            const box = fieldset.getBoundingClientRect();
            const style = getComputedStyle(fieldset);
            const firstName = fieldset.querySelector('input[name="firstname"]')
                ?.closest('.field, .admin__field')?.getBoundingClientRect();
            const lastName = fieldset.querySelector('input[name="lastname"]')
                ?.closest('.field, .admin__field')?.getBoundingClientRect();

            return {
                display: style.display,
                insidePaymentCard: Boolean(fieldset.closest(
                    '[data-fastcheckout-payment-methods-card]'
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
            insidePaymentCard: true,
            noHorizontalOverflow: true,
            firstRowHasTwoFields: true,
            inputWidth: expect.any(Number)
        });
        expect(billingLayout.inputWidth).toBeGreaterThan(150);
        await sameAsShipping.check({force: true});

        const proxy = page.locator('[data-fastcheckout-place-order-ssr]');
        await expect(proxy).toBeVisible();
        await expect(proxy).toBeEnabled();
        const clickProxy = async () => {
            await proxy.evaluate((button) => {
                button.scrollIntoView({block: 'center'});
            });
            await page.waitForTimeout(50);
            const box = await proxy.boundingBox();

            expect(box).not.toBeNull();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        };

        const telephone = shippingRoot.locator('input[name="telephone"]');
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

        await telephone.fill('');
        await clickProxy();
        await expect.poll(() => visibleErrorText(telephone)).not.toEqual([]);
        expect(paymentRequests).toBe(0);
        await telephone.fill('500600700');
        await telephone.blur();
        await expect.poll(() => visibleErrorText(telephone)).toEqual([]);
        await expect.poll(() => nativeButton.isEnabled()).toBe(true);

        await purchaseOrderNumber.fill('');
        await purchaseOrderNumber.blur();
        await clickProxy();
        await expect.poll(() => visibleErrorText(purchaseOrderNumber)).not.toEqual([]);
        expect(paymentRequests).toBe(0);
        await purchaseOrderNumber.fill('FC-E2E-' + Date.now());
        await purchaseOrderNumber.blur();

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
        await clickProxy();
        await expect.poll(() => page.evaluate(() => (
            window.fastcheckoutE2eValidationCalls
        ))).toBe(1);
        await expect.poll(() => visibleErrorText(purchaseOrderNumber)).toEqual([]);
        expect(paymentRequests).toBe(0);
        expect(pageErrors.filter((message) => (
            message.includes('requirejs is not defined') ||
            message.includes("Cannot read properties of undefined (reading 'set')")
        ))).toEqual([]);

        if (process.env.FC_ALLOW_PLACE_ORDER !== '1') {
            return;
        }

        expect(await page.evaluate(() => (
            window.require('Magento_Checkout/js/model/quote').paymentMethod()?.method
        ))).toBe('purchaseorder');

        await page.evaluate(() => {
            window.fastcheckoutE2eAllowOrder = true;
        });
        const placeOrderResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST' &&
            response.url().includes('/payment-information')
        ), {timeout: 60_000});
        await clickProxy();
        const orderResponse = await placeOrderResponse;
        expect(orderResponse.ok()).toBe(true);
        await page.waitForURL(/checkout\/onepage\/success/, {timeout: 60_000});
    });
});
