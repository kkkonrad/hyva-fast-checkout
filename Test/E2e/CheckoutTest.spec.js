import { test, expect } from '@playwright/test';

const selectors = {
    email: 'input[data-wire-field="email"]',
    firstname: 'input[data-wire-field="firstname"]',
    lastname: 'input[data-wire-field="lastname"]',
    company: 'input[data-wire-field="company"]',
    street1: 'input[data-wire-field="street1"]',
    street2: 'input[data-wire-field="street2"]',
    city: 'input[data-wire-field="city"]',
    postcode: 'input[data-wire-field="postcode"]',
    telephone: 'input[data-wire-field="telephone"]',
    country: 'select[wire\\:model\\.blur="countryId"]',
    region: 'select[wire\\:model\\.blur="regionId"]',
    savedAddresses: '#saved-address-select',
    useSavedAddressBtn: 'button[data-select-id="saved-address-select"]',
    placeOrderBtn: '#co-checkout-form button[type="submit"]',
    orderError: '#messages .message-error, #messages .message.error',
    cartItemsList: 'ul.space-y-3',
    couponInput: 'input[wire\\:model\\.defer="couponCode"]',
    couponApplyBtn: 'button[wire\\:click="applyCoupon"]',
    couponSuccess: '.mt-3.text-green-700',
    couponError: '.text-red-700',
    newsletterCheckbox: 'input[wire\\:model="subscribe"]'
};

export class CheckoutPage {
    constructor(page) {
        this.page = page;
    }

    async goto() {
        await this.page.goto('/fast-checkout/');
        await this.page.waitForLoadState('domcontentloaded');
        if (this.page.url().includes('/checkout/cart')) {
            await this.page.goto('/joust-duffle-bag.html');
            const addToCartBtn = this.page.locator('#product-addtocart-button');
            if (await addToCartBtn.isVisible()) {
                await addToCartBtn.click();
                await this.page.waitForTimeout(2000);
            }
            await this.page.goto('/fast-checkout/');
            await this.page.waitForLoadState('domcontentloaded');
        }
        // Wait for Magewire initial loader to hide
        await this.page.waitForTimeout(2000);
    }

    async fillShippingAddress(data) {
        await this.page.locator(selectors.email).fill(data.email);
        await this.page.locator(selectors.email).blur();

        await this.page.locator(selectors.firstname).fill(data.firstname);
        await this.page.locator(selectors.firstname).blur();

        await this.page.locator(selectors.lastname).fill(data.lastname);
        await this.page.locator(selectors.lastname).blur();

        await this.page.locator(selectors.street1).fill(data.street1);
        await this.page.locator(selectors.street1).blur();

        await this.page.locator(selectors.city).fill(data.city);
        await this.page.locator(selectors.city).blur();

        await this.page.locator(selectors.postcode).fill(data.postcode);
        await this.page.locator(selectors.postcode).blur();

        await this.page.locator(selectors.telephone).fill(data.telephone);
        await this.page.locator(selectors.telephone).blur();
    }

    async selectSavedAddress(addressId) {
        await this.page.locator(selectors.savedAddresses).selectOption({ value: String(addressId) });
        await this.page.locator(selectors.useSavedAddressBtn).click();
    }

    async applyCoupon(code) {
        await this.page.locator(selectors.couponInput).fill(code);
        await this.page.locator(selectors.couponApplyBtn).click({ force: true });
    }

    async toggleNewsletter() {
        await this.page.locator(selectors.newsletterCheckbox).click();
    }

    async placeOrder() {
        await this.page.locator(selectors.placeOrderBtn).first().click({ force: true });
        await this.page.waitForTimeout(2000);
    }
}

test.describe('Kkkonrad Fastcheckout E2E Tests', () => {

    test('should expose Magento KO checkout compatibility surface', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => {
            return Boolean(
                window.fastcheckoutHyvaPayment &&
                window.fastcheckoutHyvaShipping &&
                typeof window.require === 'function'
            );
        }), {
            timeout: 10000
        }).toBe(true);

        const compatibility = await page.evaluate(() => new Promise((resolve) => {
            const moduleNames = [
                'uiRegistry',
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/view/payment/list',
                'Magento_Checkout/js/view/shipping',
                'Magento_Checkout/js/view/shipping-information',
                'Magento_Checkout/js/view/form/element/email',
                'Magento_Checkout/js/action/select-shipping-address',
                'Magento_Checkout/js/action/select-shipping-method',
                'Magento_Checkout/js/action/set-shipping-information',
                'Magento_Checkout/js/action/select-payment-method',
                'Magento_Checkout/js/action/set-payment-information',
                'Magento_Checkout/js/action/set-billing-address',
                'Magento_Checkout/js/action/place-order',
                'mage/storage'
            ];

            window.require(moduleNames, (...modules) => {
                const registry = modules[0];
                const quote = modules[1];

                const getRegistryItem = (name) => {
                    try {
                        return registry.get(name);
                    } catch (error) {
                        return null;
                    }
                };

                resolve({
                    missingModules: moduleNames.filter((name, index) => !modules[index]),
                    quote: {
                        shippingAddress: typeof quote.shippingAddress === 'function',
                        billingAddress: typeof quote.billingAddress === 'function',
                        shippingMethod: typeof quote.shippingMethod === 'function',
                        paymentMethod: typeof quote.paymentMethod === 'function'
                    },
                    registry: {
                        checkoutProvider: Boolean(getRegistryItem('checkoutProvider')),
                        shippingAddress: Boolean(getRegistryItem('index = shippingAddress') || getRegistryItem('fastcheckout.shippingAddress')),
                        billingAddress: Boolean(getRegistryItem('index = billingAddress') || getRegistryItem('fastcheckout.billingAddress')),
                        checkoutErrors: Boolean(getRegistryItem('checkout.errors')),
                        shippingInformation: Boolean(getRegistryItem('fastcheckout.shippingInformation')),
                        email: Boolean(getRegistryItem('checkout.steps.shipping-step.shippingAddress.customer-email')),
                        paymentList: Boolean(getRegistryItem('fastcheckoutHyvaPaymentRenderers.paymentList'))
                    },
                    bridges: {
                        payment: [
                            'syncFieldToKo',
                            'getActiveRenderer',
                            'onSelectPaymentMethodAction',
                            'onSetPaymentInformationAction',
                            'onSetBillingAddressAction',
                            'onPlaceOrderAction'
                        ].filter((name) => typeof window.fastcheckoutHyvaPayment[name] !== 'function'),
                        shipping: [
                            'syncAddress',
                            'syncShippingMethod',
                            'syncShippingMethodToMagewire',
                            'onSelectShippingAddressAction',
                            'onSelectBillingAddressAction',
                            'onSelectShippingMethodAction',
                            'onSetShippingInformationAction',
                            'onEstimateShippingRatesAction',
                            'validate'
                        ].filter((name) => typeof window.fastcheckoutHyvaShipping[name] !== 'function')
                    }
                });
            }, (error) => {
                resolve({
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(compatibility.requireError).toBeFalsy();
        expect(compatibility.missingModules).toEqual([]);
        expect(compatibility.quote).toEqual({
            shippingAddress: true,
            billingAddress: true,
            shippingMethod: true,
            paymentMethod: true
        });
        expect(compatibility.registry).toEqual({
            checkoutProvider: true,
            shippingAddress: true,
            billingAddress: true,
            checkoutErrors: true,
            shippingInformation: true,
            email: true,
            paymentList: true
        });
        expect(compatibility.bridges.payment).toEqual([]);
        expect(compatibility.bridges.shipping).toEqual([]);
    });

    test('should execute standard Magento KO checkout actions through Fastcheckout bridge', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const actionResult = await page.evaluate(() => new Promise((resolve) => {
            window.require([
                'jquery',
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/action/select-billing-address',
                'Magento_Checkout/js/action/select-shipping-address',
                'Magento_Checkout/js/action/select-shipping-method',
                'Magento_Checkout/js/action/set-shipping-information',
                'Magento_Checkout/js/action/set-billing-address',
                'Magento_Checkout/js/action/set-payment-information',
                'Magento_Checkout/js/action/get-payment-information',
                'Magento_Checkout/js/model/payment-service',
                'Magento_Checkout/js/model/shipping-service',
                'Magento_Checkout/js/model/full-screen-loader',
                'Magento_Ui/js/model/messageList'
            ], (
                $,
                quote,
                selectBillingAddress,
                selectShippingAddress,
                selectShippingMethod,
                setShippingInformation,
                setBillingAddress,
                setPaymentInformation,
                getPaymentInformation,
                paymentService,
                shippingService,
                fullScreenLoader,
                messageList
            ) => {
                const waitForPromise = (deferred) => new Promise((resolveDeferred, rejectDeferred) => {
                    $.when(deferred)
                        .done((response) => resolveDeferred(response))
                        .fail((error) => rejectDeferred(error || new Error('Deferred rejected')));
                });

                const estimateShippingRates = async (address) => {
                    if (
                        window.fastcheckoutHyvaShipping &&
                        typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction === 'function'
                    ) {
                        return window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(address);
                    }

                    return [];
                };

                const address = {
                    firstname: 'Ko',
                    lastname: 'Compatibility',
                    company: '',
                    street: ['Test Street 12'],
                    city: 'Warszawa',
                    postcode: '00-001',
                    countryId: 'PL',
                    country_id: 'PL',
                    region: '',
                    regionId: null,
                    region_id: null,
                    telephone: '123456789',
                    prefix: 'Dr',
                    middlename: 'Middle',
                    suffix: 'Jr',
                    fax: '987654321',
                    vatId: 'PL1234567890',
                    vat_id: 'PL1234567890',
                    saveInAddressBook: null,
                    customAttributes: {
                        compat_test: 'yes'
                    },
                    extension_attributes: {
                        compat_test: 'yes'
                    },
                    getType: () => 'new-customer-address',
                    canUseForBilling: () => true
                };

                const pickShippingMethod = () => {
                    const current = quote.shippingMethod && quote.shippingMethod();
                    const serviceRates = typeof shippingService.getShippingRates === 'function'
                        ? shippingService.getShippingRates()()
                        : [];
                    const domInput = document.querySelector('input[name="shipping_method"]:not(:disabled)');

                    if (current && current.carrier_code && current.method_code) {
                        return current;
                    }

                    if (serviceRates && serviceRates.length) {
                        return serviceRates[0];
                    }

                    if (domInput && domInput.value) {
                        const parts = domInput.value.split('_');
                        return {
                            carrier_code: parts.shift() || '',
                            method_code: parts.join('_') || '',
                            carrier_title: domInput.dataset.carrierTitle || '',
                            method_title: domInput.dataset.methodTitle || domInput.value,
                            amount: 0,
                            base_amount: 0,
                            available: true
                        };
                    }

                    return null;
                };

                const pickPaymentMethod = () => {
                    const current = quote.paymentMethod && quote.paymentMethod();
                    const methods = typeof paymentService.getAvailablePaymentMethods === 'function'
                        ? paymentService.getAvailablePaymentMethods()
                        : [];
                    const domInput = document.querySelector('input[name="payment_method"]:not(:disabled)');

                    if (current && current.method) {
                        return current.method;
                    }

                    if (methods && methods.length && methods[0].method) {
                        return methods[0].method;
                    }

                    return domInput ? domInput.value : '';
                };

                const getWireSnapshot = () => {
                    const el = document.querySelector('[wire\\:id]');
                    const livewire = window.Livewire || window.Magewire;
                    const wire = el && livewire && typeof livewire.find === 'function'
                        ? livewire.find(el.getAttribute('wire:id'))
                        : null;

                    if (!wire) {
                        return {};
                    }

                    const get = (name) => {
                        if (typeof wire[name] !== 'undefined') {
                            return wire[name];
                        }
                        return typeof wire.get === 'function' ? wire.get(name) : undefined;
                    };

                    return {
                        prefix: get('prefix'),
                        middlename: get('middlename'),
                        suffix: get('suffix'),
                        fax: get('fax'),
                        vatId: get('vatId'),
                        billingPrefix: get('billingPrefix'),
                        billingMiddlename: get('billingMiddlename'),
                        billingSuffix: get('billingSuffix'),
                        billingFax: get('billingFax'),
                        billingVatId: get('billingVatId')
                    };
                };

                (async () => {
                    try {
                        if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                            fullScreenLoader.stopLoader(true);
                        }

                        selectShippingAddress(address);
                        selectBillingAddress(address);
                        quote.guestEmail = 'ko-compatibility@example.com';
                        await estimateShippingRates(address);

                        const shippingMethod = pickShippingMethod();
                        if (!shippingMethod) {
                            resolve({
                                ok: false,
                                step: 'pickShippingMethod',
                                reason: 'No shipping method available for KO action test'
                            });
                            return;
                        }

                        selectShippingMethod(shippingMethod);

                        const shippingResponse = await waitForPromise(setShippingInformation());
                        const billingResponse = await waitForPromise(setBillingAddress(messageList));

                        const paymentMethod = pickPaymentMethod();
                        if (!paymentMethod) {
                            resolve({
                                ok: false,
                                step: 'pickPaymentMethod',
                                reason: 'No payment method available for KO action test'
                            });
                            return;
                        }

                        const paymentResponse = await waitForPromise(setPaymentInformation(messageList, {
                            method: paymentMethod,
                            additional_data: {
                                ko_compatibility_test: 'yes'
                            },
                            extension_attributes: {
                                ko_compatibility_test: 'yes'
                            }
                        }));

                        const paymentInfoDeferred = $.Deferred();
                        await waitForPromise(getPaymentInformation(paymentInfoDeferred, messageList));

                        const wireSnapshot = getWireSnapshot();

                        resolve({
                            ok: true,
                            shipping: {
                                hasTotals: Boolean(shippingResponse && shippingResponse.totals),
                                paymentMethods: shippingResponse && Array.isArray(shippingResponse.payment_methods)
                                    ? shippingResponse.payment_methods.length
                                    : -1
                            },
                            billing: {
                                hasTotals: Boolean(billingResponse && billingResponse.totals),
                                paymentMethods: billingResponse && Array.isArray(billingResponse.payment_methods)
                                    ? billingResponse.payment_methods.length
                                    : -1
                            },
                            payment: paymentResponse === true,
                            quote: {
                                shippingMethod: Boolean(quote.shippingMethod && quote.shippingMethod()),
                                billingAddress: Boolean(quote.billingAddress && quote.billingAddress()),
                                paymentMethod
                            },
                            wire: wireSnapshot,
                            messages: {
                                hasErrors: messageList && typeof messageList.hasMessages === 'function'
                                    ? messageList.hasMessages()
                                    : false,
                                errors: messageList && typeof messageList.errorMessages === 'function'
                                    ? messageList.errorMessages()
                                    : [],
                                success: messageList && typeof messageList.successMessages === 'function'
                                    ? messageList.successMessages()
                                    : []
                            }
                        });
                    } catch (error) {
                        resolve({
                            ok: false,
                            step: 'exception',
                            message: error && (error.message || error.statusText || String(error))
                        });
                    } finally {
                        if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                            fullScreenLoader.stopLoader(true);
                        }
                    }
                })();
            }, (error) => {
                resolve({
                    ok: false,
                    step: 'require',
                    message: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(actionResult, JSON.stringify(actionResult, null, 2)).toMatchObject({
            ok: true,
            shipping: {
                hasTotals: true
            },
            billing: {
                hasTotals: true
            },
            payment: true,
            quote: {
                shippingMethod: true,
                billingAddress: true
            },
            messages: {
                hasErrors: false
            }
        });
        expect(actionResult.shipping.paymentMethods).toBeGreaterThanOrEqual(0);
        expect(actionResult.billing.paymentMethods).toBeGreaterThanOrEqual(0);
        expect(actionResult.quote.paymentMethod).toBeTruthy();
        expect(actionResult.wire).toMatchObject({
            prefix: 'Dr',
            middlename: 'Middle',
            suffix: 'Jr',
            fax: '987654321',
            vatId: 'PL1234567890',
            billingPrefix: 'Dr',
            billingMiddlename: 'Middle',
            billingSuffix: 'Jr',
            billingFax: '987654321',
            billingVatId: 'PL1234567890'
        });
    });

    test('should buffer direct Magento checkout-data setters and apply them to Fastcheckout state', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(window.fastcheckoutCheckoutDataBufferReady)), {
            timeout: 10000
        }).toBe(true);

        const syncResult = await page.evaluate(() => new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                resolve({
                    ok: false,
                    step: 'timeout'
                });
            }, 5000);

            window.require([
                'Magento_Checkout/js/checkout-data'
            ], (
                checkoutData
            ) => {
                const address = {
                    firstname: 'CheckoutData',
                    lastname: 'Sync',
                    company: '',
                    street: ['Checkout Data Street 9'],
                    city: 'Krakow',
                    postcode: '30-001',
                    country_id: 'PL',
                    countryId: 'PL',
                    region: '',
                    region_id: null,
                    regionId: null,
                    telephone: '123456789'
                };
                const events = [];
                const listener = (event) => {
                    events.push(event.detail && event.detail.method);
                };
                const getWire = () => {
                    const el = document.querySelector('[wire\\:id]');
                    const livewire = window.Livewire || window.Magewire;

                    return el && livewire && typeof livewire.find === 'function'
                        ? livewire.find(el.getAttribute('wire:id'))
                        : null;
                };
                window.addEventListener('fastcheckout:checkout-data-set', listener);

                checkoutData.setShippingAddressFromData(address);
                checkoutData.setBillingAddressFromData(address);
                checkoutData.setValidatedEmailValue('checkout-data-sync@example.com');
                checkoutData.setSelectedPaymentMethod('checkmo');
                checkoutData.setSelectedShippingRate('flatrate_flatrate');

                window.setTimeout(() => {
                    const wire = getWire();
                    let applied = false;
                    Promise.resolve(
                        wire && typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                            ? window.fastcheckoutApplyPendingCheckoutData(wire)
                            : true
                    ).then((result) => {
                        applied = result;
                        window.clearTimeout(timeout);
                        window.removeEventListener('fastcheckout:checkout-data-set', listener);
                        resolve({
                            ok: true,
                            events,
                            email: checkoutData.getValidatedEmailValue(),
                            shippingAddress: checkoutData.getShippingAddressFromData(),
                            billingAddress: checkoutData.getBillingAddressFromData(),
                            paymentMethod: checkoutData.getSelectedPaymentMethod(),
                            shippingRate: checkoutData.getSelectedShippingRate(),
                            applied,
                            pending: window.fastcheckoutPendingCheckoutData
                        });
                    }).catch((error) => {
                        window.clearTimeout(timeout);
                        window.removeEventListener('fastcheckout:checkout-data-set', listener);
                        resolve({
                            ok: false,
                            step: 'apply',
                            message: error && (error.message || error.statusText || String(error))
                        });
                    });
                }, 800);
            }, (error) => {
                window.clearTimeout(timeout);
                resolve({
                    ok: false,
                    step: 'require',
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(syncResult, JSON.stringify(syncResult, null, 2)).toMatchObject({
            ok: true,
            email: 'checkout-data-sync@example.com',
            paymentMethod: 'checkmo',
            shippingRate: 'flatrate_flatrate'
        });
        expect(syncResult.requireError).toBeFalsy();
        expect(syncResult.events).toEqual(expect.arrayContaining([
            'setShippingAddressFromData',
            'setBillingAddressFromData',
            'setValidatedEmailValue',
            'setSelectedPaymentMethod',
            'setSelectedShippingRate'
        ]));
        expect(syncResult.shippingAddress).toMatchObject({
            firstname: 'CheckoutData',
            lastname: 'Sync',
            street: ['Checkout Data Street 9'],
            city: 'Krakow',
        });
        expect(syncResult.billingAddress).toMatchObject({
            firstname: 'CheckoutData',
            lastname: 'Sync',
            street: ['Checkout Data Street 9'],
            city: 'Krakow'
        });
        expect(syncResult, JSON.stringify(syncResult, null, 2)).toMatchObject({
            applied: true,
            pending: {
                changed: false
            }
        });
    });

    test('should route custom KO shipping-rate processors through Fastcheckout bridge', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaShipping &&
            typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction === 'function'
        )), {
            timeout: 10000
        }).toBe(true);

        const processorResult = await page.evaluate(() => new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                resolve({
                    ok: false,
                    step: 'timeout'
                });
            }, 8000);

            window.require([
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/model/shipping-rate-service',
                'Magento_Checkout/js/model/shipping-service'
            ], (
                quote,
                shippingRateService,
                shippingService
            ) => {
                const processorType = 'fastcheckout-e2e-custom-address';
                const cacheKey = `${processorType}-${Date.now()}`;
                const originalEstimate = window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction;
                let originalProcessorCalls = 0;
                let estimateCalls = 0;
                let estimatedRateCount = null;

                const restore = () => {
                    window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction = originalEstimate;
                    window.clearTimeout(timeout);
                };

                const address = {
                    firstname: 'Custom',
                    lastname: 'Processor',
                    company: '',
                    street: ['Custom Processor Street 1'],
                    city: 'Warszawa',
                    postcode: '00-001',
                    countryId: 'PL',
                    country_id: 'PL',
                    region: '',
                    regionId: null,
                    region_id: null,
                    telephone: '123456789',
                    saveInAddressBook: null,
                    customAttributes: [],
                    extension_attributes: {},
                    getType: () => processorType,
                    getCacheKey: () => cacheKey,
                    canUseForBilling: () => true
                };

                window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction = function () {
                    estimateCalls += 1;

                    return Promise.resolve(originalEstimate.apply(this, arguments)).then((rates) => {
                        estimatedRateCount = Array.isArray(rates) ? rates.length : null;

                        return rates;
                    });
                };

                shippingRateService.registerProcessor(processorType, {
                    getRates: () => {
                        originalProcessorCalls += 1;
                    }
                });

                shippingService.setShippingRates([]);
                quote.shippingAddress(address);

                const startedAt = Date.now();
                const check = () => {
                    const serviceRates = typeof shippingService.getShippingRates === 'function'
                        ? shippingService.getShippingRates()()
                        : [];

                    if (estimateCalls > 0 && shippingService.isLoading && !shippingService.isLoading()) {
                        restore();
                        resolve({
                            ok: true,
                            originalProcessorCalls,
                            estimateCalls,
                            estimatedRateCount,
                            serviceRateCount: Array.isArray(serviceRates) ? serviceRates.length : null,
                            addressType: quote.shippingAddress() && quote.shippingAddress().getType
                                ? quote.shippingAddress().getType()
                                : null
                        });

                        return;
                    }

                    if (Date.now() - startedAt > 7000) {
                        restore();
                        resolve({
                            ok: false,
                            step: 'wait',
                            originalProcessorCalls,
                            estimateCalls,
                            estimatedRateCount,
                            isLoading: shippingService.isLoading ? shippingService.isLoading() : null,
                            serviceRateCount: Array.isArray(serviceRates) ? serviceRates.length : null
                        });

                        return;
                    }

                    window.setTimeout(check, 100);
                };

                check();
            }, (error) => {
                window.clearTimeout(timeout);
                resolve({
                    ok: false,
                    step: 'require',
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(processorResult, JSON.stringify(processorResult, null, 2)).toMatchObject({
            ok: true,
            originalProcessorCalls: 0,
            addressType: 'fastcheckout-e2e-custom-address'
        });
        expect(processorResult.requireError).toBeFalsy();
        expect(processorResult.estimateCalls).toBeGreaterThanOrEqual(1);
        expect(processorResult.serviceRateCount).toBe(processorResult.estimatedRateCount);
    });

    test('should load standard KO shipping rate validators and block invalid rate estimates', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaShipping &&
            typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction === 'function' &&
            window.fastcheckoutShippingRatesValidationComponentsLoaded
        )), {
            timeout: 10000
        }).toBe(true);

        const validationResult = await page.evaluate(() => new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                resolve({
                    ok: false,
                    step: 'timeout'
                });
            }, 5000);

            window.require([
                'Magento_Checkout/js/model/shipping-rates-validator',
                'Magento_Checkout/js/model/shipping-rates-validation-rules',
                'Magento_Checkout/js/model/shipping-service'
            ], (
                shippingRatesValidator,
                shippingRatesValidationRules,
                shippingService
            ) => {
                const livewireEl = document.querySelector('[wire\\:id]');
                const livewire = window.Livewire || window.Magewire;
                const wire = livewireEl && livewire && typeof livewire.find === 'function'
                    ? livewire.find(livewireEl.getAttribute('wire:id'))
                    : livewireEl && livewireEl.__livewire
                        ? livewireEl.__livewire
                        : null;
                const originalCall = wire && typeof wire.call === 'function' ? wire.call : null;
                let saveShippingAddressCalls = 0;

                const invalidAddress = {
                    firstname: 'Invalid',
                    lastname: 'Shipping',
                    street: ['No Country Street 1'],
                    city: 'Warszawa',
                    postcode: '00-001',
                    countryId: '',
                    country_id: '',
                    telephone: '123456789',
                    getType: () => 'new-customer-address',
                    getCacheKey: () => `fastcheckout-invalid-${Date.now()}`,
                    canUseForBilling: () => true
                };

                if (wire && originalCall) {
                    wire.call = function (methodName) {
                        if (methodName === 'saveShippingAddress') {
                            saveShippingAddressCalls += 1;
                        }

                        return originalCall.apply(this, arguments);
                    };
                }

                Promise.resolve(window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(invalidAddress))
                    .then((rates) => {
                        if (wire && originalCall) {
                            wire.call = originalCall;
                        }
                        window.clearTimeout(timeout);
                        resolve({
                            ok: true,
                            components: window.fastcheckoutShippingRatesValidationComponentNames || [],
                            observableFields: typeof shippingRatesValidationRules.getObservableFields === 'function'
                                ? shippingRatesValidationRules.getObservableFields()
                                : [],
                            directValidation: typeof shippingRatesValidator.validateAddressData === 'function'
                                ? shippingRatesValidator.validateAddressData(invalidAddress)
                                : null,
                            rates,
                            serviceRates: typeof shippingService.getShippingRates === 'function'
                                ? shippingService.getShippingRates()()
                                : null,
                            saveShippingAddressCalls
                        });
                    })
                    .catch((error) => {
                        if (wire && originalCall) {
                            wire.call = originalCall;
                        }
                        window.clearTimeout(timeout);
                        resolve({
                            ok: false,
                            step: 'estimate',
                            message: error && (error.message || error.statusText || String(error)),
                            saveShippingAddressCalls
                        });
                    });
            }, (error) => {
                window.clearTimeout(timeout);
                resolve({
                    ok: false,
                    step: 'require',
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(validationResult, JSON.stringify(validationResult, null, 2)).toMatchObject({
            ok: true,
            directValidation: false,
            rates: [],
            serviceRates: [],
            saveShippingAddressCalls: 0
        });
        expect(validationResult.requireError).toBeFalsy();
        expect(validationResult.components.length).toBeGreaterThan(0);
        expect(validationResult.observableFields).toContain('country_id');
    });

    test('should honor standard Magento additional validators and global messageList', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaPayment &&
            typeof window.fastcheckoutHyvaPayment.validate === 'function'
        )), {
            timeout: 10000
        }).toBe(true);

        const validationResult = await page.evaluate(() => new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                resolve({
                    ok: false,
                    step: 'timeout'
                });
            }, 5000);

            window.require([
                'Magento_Checkout/js/model/payment/additional-validators',
                'Magento_Ui/js/model/messageList'
            ], (
                additionalValidators,
                messageList
            ) => {
                const initialValidatorCount = typeof additionalValidators.getValidators === 'function'
                    ? additionalValidators.getValidators().length
                    : 0;
                const validatorMessage = 'Fastcheckout validator blocked order';
                const paymentErrors = [];
                const paymentMessages = [];
                const errorListener = (event) => {
                    paymentErrors.push(event.detail && event.detail.message);
                };
                const messageListener = (event) => {
                    paymentMessages.push(event.detail || {});
                };
                const validator = {
                    validate: () => {
                        messageList.addErrorMessage({ message: validatorMessage });
                        return false;
                    }
                };

                document.addEventListener('fastcheckout:payment-error', errorListener);
                document.addEventListener('fastcheckout:payment-message', messageListener);
                additionalValidators.registerValidator(validator);

                const isValid = window.fastcheckoutHyvaPayment.validate();

                window.setTimeout(() => {
                    const validators = typeof additionalValidators.getValidators === 'function'
                        ? additionalValidators.getValidators()
                        : [];

                    validators.splice(initialValidatorCount);
                    document.removeEventListener('fastcheckout:payment-error', errorListener);
                    document.removeEventListener('fastcheckout:payment-message', messageListener);
                    window.clearTimeout(timeout);

                    resolve({
                        ok: true,
                        isValid,
                        paymentErrors,
                        paymentMessages,
                        messageListErrors: typeof messageList.errorMessages === 'function'
                            ? messageList.errorMessages()
                            : []
                    });
                }, 200);
            }, (error) => {
                window.clearTimeout(timeout);
                resolve({
                    ok: false,
                    step: 'require',
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(validationResult, JSON.stringify(validationResult, null, 2)).toMatchObject({
            ok: true,
            isValid: false
        });
        expect(validationResult.requireError).toBeFalsy();
        expect(validationResult.messageListErrors).toContain('Fastcheckout validator blocked order');
        expect(validationResult.paymentErrors).toContain('Fastcheckout validator blocked order');
        expect(validationResult.paymentMessages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: 'error',
                message: 'Fastcheckout validator blocked order'
            })
        ]));
    });

    test('should load standard KO payment validation components from checkout layout', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutPaymentValidationComponentsLoaded &&
            Array.isArray(window.fastcheckoutPaymentValidationComponentNames)
        )), {
            timeout: 10000
        }).toBe(true);

        const componentResult = await page.evaluate(() => new Promise((resolve) => {
            const timeout = window.setTimeout(() => {
                resolve({
                    ok: false,
                    step: 'timeout'
                });
            }, 5000);

            window.require([
                'Magento_Checkout/js/model/payment/additional-validators'
            ], (
                additionalValidators
            ) => {
                window.clearTimeout(timeout);
                const validators = typeof additionalValidators.getValidators === 'function'
                    ? additionalValidators.getValidators()
                    : [];

                resolve({
                    ok: true,
                    components: window.fastcheckoutPaymentValidationComponentNames || [],
                    validatorCount: validators.length,
                    hasEmailValidatorComponent: (window.fastcheckoutPaymentValidationComponentNames || [])
                        .indexOf('Magento_Checkout/js/view/payment/email-validator') !== -1
                });
            }, (error) => {
                window.clearTimeout(timeout);
                resolve({
                    ok: false,
                    step: 'require',
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(componentResult, JSON.stringify(componentResult, null, 2)).toMatchObject({
            ok: true,
            hasEmailValidatorComponent: true
        });
        expect(componentResult.requireError).toBeFalsy();
        expect(componentResult.components.length).toBeGreaterThan(0);
        expect(componentResult.validatorCount).toBeGreaterThan(0);
    });

    test('should not loop Magewire or checkout state requests after selecting payment method', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaPayment &&
            typeof window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction === 'function'
        )), {
            timeout: 10000
        }).toBe(true);

        const requests = {
            magewire: 0,
            state: 0
        };

        page.on('request', (request) => {
            const url = request.url();

            if (url.includes('/magewire/post/livewire/message/kkkonrad.fastcheckout.hyva.checkout')) {
                requests.magewire += 1;
            }
            if (url.includes('/fast-checkout/index/state')) {
                requests.state += 1;
            }
        });

        const selectionResult = await page.evaluate(() => new Promise((resolve) => {
            window.require([
                'Magento_Checkout/js/model/payment-service'
            ], (
                paymentService
            ) => {
                const domInput = document.querySelector('input[name="payment_method"]:not(:disabled)');
                const methods = typeof paymentService.getAvailablePaymentMethods === 'function'
                    ? paymentService.getAvailablePaymentMethods()
                    : [];
                const methodCode = domInput && domInput.value
                    ? domInput.value
                    : methods && methods.length
                        ? methods[0].method
                        : '';

                if (!methodCode) {
                    resolve({
                        ok: false,
                        reason: 'No payment method available'
                    });
                    return;
                }

                if (domInput) {
                    domInput.click();
                } else {
                    window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction({ method: methodCode });
                }

                window.setTimeout(() => {
                    resolve({
                        ok: true,
                        methodCode,
                        initCount: window.fastcheckoutKoPaymentBridgeInitCount || 0
                    });
                }, 3500);
            }, (error) => {
                resolve({
                    ok: false,
                    reason: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(selectionResult, JSON.stringify(selectionResult, null, 2)).toMatchObject({
            ok: true,
            initCount: 1
        });
        expect(requests.state, JSON.stringify(requests, null, 2)).toBeLessThanOrEqual(2);
        expect(requests.magewire, JSON.stringify(requests, null, 2)).toBeLessThanOrEqual(3);
    });

    test('should lazy load third-party payment renderers', async ({ page }) => {
        const thirdPartyLoggerRequests = [];
        const pageErrors = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        page.on('request', (request) => {
            const url = request.url();
            if (
                url.includes('paypal.com/xoplatform/logger') ||
                url.includes('merch-prod.snd.payu.com/front/logger')
            ) {
                thirdPartyLoggerRequests.push(url);
            }
        });

        const checkout = new CheckoutPage(page);
        await checkout.goto();
        await page.waitForTimeout(1500);

        const lazyState = await page.evaluate(() => {
            const selected = document.querySelector('input[name="payment_method"]:checked:not(:disabled)');
            return {
                selectedMethod: selected ? selected.value : '',
                loadedComponents: window.fastcheckoutKoLoadedPaymentRendererComponents || []
            };
        });

        const selectedIsThirdParty = /payu|paypal|braintree/.test(lazyState.selectedMethod || '');
        const loadedThirdPartyComponents = lazyState.loadedComponents.filter((component) => (
            /PayU_|Paypal|PayPal|Braintree/i.test(component)
        ));

        if (!selectedIsThirdParty) {
            expect(loadedThirdPartyComponents, JSON.stringify(lazyState, null, 2)).toEqual([]);
            expect(thirdPartyLoggerRequests, JSON.stringify(thirdPartyLoggerRequests, null, 2)).toEqual([]);
        }
        expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test('should resolve dynamically suffixed payment renderer methods', async ({ page }) => {
        const pageErrors = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaPayment &&
            typeof window.fastcheckoutHyvaPayment.ensureRendererForMethod === 'function'
        )), {
            timeout: 10000
        }).toBe(true);

        const result = await page.evaluate(() => new Promise((resolve) => {
            const map = window.fastcheckoutKoPaymentRendererComponentMap || [];
            const entry = map.find((item) => (
                item &&
                item.method === 'generic' &&
                item.matchPrefix &&
                /Tpay_Magento2/.test(item.component)
            ));

            if (!entry) {
                resolve({
                    ok: true,
                    skipped: true,
                    reason: 'No generic dynamic payment renderer entry available'
                });
                return;
            }

            window.fastcheckoutHyvaPayment.ensureRendererForMethod(`${entry.method}-fastcheckout-regression`)
                .then(() => {
                    window.setTimeout(() => {
                        resolve({
                            ok: true,
                            component: entry.component,
                            loadedComponents: window.fastcheckoutKoLoadedPaymentRendererComponents || []
                        });
                    }, 250);
                })
                .catch((error) => {
                    resolve({
                        ok: false,
                        message: error && (error.message || String(error))
                    });
                });
        }));

        expect(result, JSON.stringify(result, null, 2)).toMatchObject({
            ok: true
        });
        if (!result.skipped) {
            expect(result.loadedComponents, JSON.stringify(result, null, 2)).toContain(result.component);
        }
        expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test('should expose standard payment before-place-order region children', async ({ page }) => {
        const pageErrors = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const result = await page.evaluate(() => new Promise((resolve) => {
            window.require(['uiRegistry'], (registry) => {
                const getRegistryItem = (name) => {
                    try {
                        return registry.get(name);
                    } catch (error) {
                        return null;
                    }
                };
                const paymentList = getRegistryItem('fastcheckoutHyvaPaymentRenderers.paymentList');

                if (!paymentList || typeof paymentList.getRegion !== 'function') {
                    resolve({
                        ok: false,
                        reason: 'Payment list component is missing'
                    });
                    return;
                }

                const beforePlaceOrderRegion = paymentList.getRegion('before-place-order')();
                const beforePlaceOrderComponent = getRegistryItem(
                    'fastcheckoutHyvaPaymentRenderers.paymentList.before-place-order'
                );

                resolve({
                    ok: true,
                    regionLength: beforePlaceOrderRegion.length,
                    componentName: beforePlaceOrderComponent && beforePlaceOrderComponent.name,
                    hasTemplate: Boolean(
                        beforePlaceOrderComponent &&
                        typeof beforePlaceOrderComponent.hasTemplate === 'function' &&
                        beforePlaceOrderComponent.hasTemplate()
                    ),
                    childNames: beforePlaceOrderRegion.map((component) => component.name)
                });
            }, (error) => {
                resolve({
                    ok: false,
                    reason: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(result, JSON.stringify(result, null, 2)).toMatchObject({
            ok: true,
            regionLength: expect.any(Number),
            componentName: 'fastcheckoutHyvaPaymentRenderers.paymentList.before-place-order',
            hasTemplate: true
        });
        expect(result.regionLength, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test('should expose standard payment-level regions', async ({ page }) => {
        const pageErrors = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const result = await page.evaluate(() => new Promise((resolve) => {
            window.require(['uiRegistry'], (registry) => {
                const getRegistryItem = (name) => {
                    try {
                        return registry.get(name);
                    } catch (error) {
                        return null;
                    }
                };
                const root = getRegistryItem('fastcheckoutHyvaPaymentRenderers');

                if (!root || typeof root.getRegion !== 'function') {
                    resolve({
                        ok: false,
                        reason: 'Payment root component is missing'
                    });
                    return;
                }

                const afterMethods = root.getRegion('afterMethods')();
                const captcha = root.getRegion('place-order-captcha')();
                const afterMethodsComponent = getRegistryItem('fastcheckoutHyvaPaymentRenderers.afterMethods');
                const captchaComponent = getRegistryItem('fastcheckoutHyvaPaymentRenderers.place-order-captcha');

                resolve({
                    ok: true,
                    afterMethodsLength: afterMethods.length,
                    captchaLength: captcha.length,
                    afterMethodsComponent: afterMethodsComponent && afterMethodsComponent.name,
                    captchaComponent: captchaComponent && captchaComponent.name
                });
            }, (error) => {
                resolve({
                    ok: false,
                    reason: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(result, JSON.stringify(result, null, 2)).toMatchObject({
            ok: true,
            afterMethodsLength: expect.any(Number),
            captchaLength: expect.any(Number),
            afterMethodsComponent: 'fastcheckoutHyvaPaymentRenderers.afterMethods',
            captchaComponent: 'fastcheckoutHyvaPaymentRenderers.place-order-captcha'
        });
        expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test('should expose standard shipping address extension regions', async ({ page }) => {
        const pageErrors = [];

        page.on('pageerror', (error) => {
            pageErrors.push(error.message);
        });

        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => new Promise((resolve) => {
            window.require(['uiRegistry'], (registry) => {
                try {
                    resolve(Boolean(registry.get('checkout.steps.shipping-step.shippingAddress')));
                } catch (error) {
                    resolve(false);
                }
            }, () => resolve(false));
        })), {
            timeout: 10000
        }).toBe(true);

        const result = await page.evaluate(() => new Promise((resolve) => {
            window.require(['uiRegistry'], (registry) => {
                const getRegistryItem = (name) => {
                    try {
                        return registry.get(name);
                    } catch (error) {
                        return null;
                    }
                };
                const root = getRegistryItem('checkout.steps.shipping-step.shippingAddress');

                if (!root || typeof root.getRegion !== 'function') {
                    resolve({
                        ok: false,
                        reason: 'Standard shipping address component is missing'
                    });
                    return;
                }

                const beforeForm = root.getRegion('before-form')();
                const beforeFields = root.getRegion('before-fields')();
                const additionalAddresses = root.getRegion('address-list-additional-addresses')();
                const beforeShippingMethod = getRegistryItem(
                    'checkout.steps.shipping-step.shippingAddress.before-shipping-method-form'
                );

                resolve({
                    ok: true,
                    beforeFormLength: beforeForm.length,
                    beforeFieldsLength: beforeFields.length,
                    additionalAddressesLength: additionalAddresses.length,
                    beforeFormComponent: getRegistryItem('checkout.steps.shipping-step.shippingAddress.before-form') &&
                        getRegistryItem('checkout.steps.shipping-step.shippingAddress.before-form').name,
                    beforeFieldsComponent: getRegistryItem('checkout.steps.shipping-step.shippingAddress.before-fields') &&
                        getRegistryItem('checkout.steps.shipping-step.shippingAddress.before-fields').name,
                    additionalAddressesComponent: getRegistryItem(
                        'checkout.steps.shipping-step.shippingAddress.address-list-additional-addresses'
                    ) && getRegistryItem(
                        'checkout.steps.shipping-step.shippingAddress.address-list-additional-addresses'
                    ).name,
                    beforeShippingMethodAlias: beforeShippingMethod && beforeShippingMethod.name
                });
            }, (error) => {
                resolve({
                    ok: false,
                    reason: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(result, JSON.stringify(result, null, 2)).toMatchObject({
            ok: true,
            beforeFormLength: expect.any(Number),
            beforeFieldsLength: expect.any(Number),
            additionalAddressesLength: expect.any(Number),
            beforeFormComponent: 'checkout.steps.shipping-step.shippingAddress.before-form',
            beforeFieldsComponent: 'checkout.steps.shipping-step.shippingAddress.before-fields',
            additionalAddressesComponent: 'checkout.steps.shipping-step.shippingAddress.address-list-additional-addresses',
            beforeShippingMethodAlias: 'fastcheckoutHyvaShippingRenderers.shippingList.before-shipping-method-form'
        });
        expect(result.beforeFormLength, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(result.beforeFieldsLength, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(result.additionalAddressesLength, JSON.stringify(result, null, 2)).toBeGreaterThan(0);
        expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test('should sync checkoutProvider shipping custom attributes to quote and Magewire', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await expect.poll(async () => page.evaluate(() => Boolean(
            window.fastcheckoutHyvaPayment &&
            window.fastcheckoutHyvaShipping &&
            typeof window.require === 'function'
        )), {
            timeout: 10000
        }).toBe(true);

        const result = await page.evaluate(() => new Promise((resolve) => {
            window.require([
                'uiRegistry',
                'Magento_Checkout/js/model/quote'
            ], (registry, quote) => {
                const provider = registry.get('checkoutProvider');
                const currentAddress = quote.shippingAddress() || {
                    firstname: 'Provider',
                    lastname: 'Sync',
                    street: ['Provider Sync Street'],
                    city: 'Warszawa',
                    postcode: '00-001',
                    countryId: 'PL',
                    country_id: 'PL',
                    telephone: '123456789'
                };
                const getWire = () => {
                    const el = document.querySelector('#fastcheckout-checkout[wire\\:id], #fastcheckout-checkout [wire\\:id]');
                    const livewire = window.Livewire || window.Magewire;

                    if (!el || !livewire || typeof livewire.find !== 'function') {
                        return null;
                    }

                    return livewire.find(el.getAttribute('wire:id'));
                };
                const getWireValue = (wire, key) => {
                    if (!wire) {
                        return undefined;
                    }
                    if (typeof wire[key] !== 'undefined') {
                        return wire[key];
                    }
                    if (typeof wire.get === 'function') {
                        return wire.get(key);
                    }
                    if (wire.data && typeof wire.data[key] !== 'undefined') {
                        return wire.data[key];
                    }

                    return undefined;
                };

                quote.shippingAddress(currentAddress);
                provider.set('shippingAddress.custom_attributes.delivery_note', 'Leave at reception');
                provider.set('shippingAddress.extension_attributes.delivery_code', 'ABC-123');

                window.setTimeout(() => {
                    const shippingAddress = quote.shippingAddress() || {};

                    Promise.resolve(
                        window.fastcheckoutHyvaShipping.onSelectShippingAddressAction(shippingAddress)
                    ).then(() => {
                        window.setTimeout(() => {
                            const wire = getWire();

                            resolve({
                                providerCustom: provider.get('shippingAddress.custom_attributes.delivery_note'),
                                providerCustomMap: provider.get('shippingAddress.custom_attributes') || {},
                                providerExtension: provider.get('shippingAddress.extension_attributes.delivery_code'),
                                providerExtensionMap: provider.get('shippingAddress.extension_attributes') || {},
                                quoteCustomMap: shippingAddress.custom_attributes || {},
                                quoteCustomArray: shippingAddress.customAttributes || [],
                                quoteExtension: shippingAddress.extension_attributes || {},
                                wireCustom: getWireValue(wire, 'shippingCustomAttributes') || {},
                                wireExtension: getWireValue(wire, 'shippingExtensionAttributes') || {}
                            });
                        }, 250);
                    });
                }, 900);
            }, (error) => {
                resolve({
                    requireError: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(result.requireError).toBeFalsy();
        expect(
            result.providerCustom || result.providerCustomMap.delivery_note,
            JSON.stringify(result, null, 2)
        ).toBe('Leave at reception');
        expect(
            result.providerExtension || result.providerExtensionMap.delivery_code,
            JSON.stringify(result, null, 2)
        ).toBe('ABC-123');
        expect(result.quoteCustomMap.delivery_note, JSON.stringify(result, null, 2)).toBe('Leave at reception');
        expect(result.quoteCustomArray, JSON.stringify(result, null, 2)).toContainEqual({
            attribute_code: 'delivery_note',
            value: 'Leave at reception'
        });
        expect(result.quoteExtension.delivery_code, JSON.stringify(result, null, 2)).toBe('ABC-123');
        expect(result.wireCustom.delivery_note, JSON.stringify(result, null, 2)).toBe('Leave at reception');
        expect(result.wireExtension.delivery_code, JSON.stringify(result, null, 2)).toBe('ABC-123');
    });

    test('should route standard Magento KO place-order action through Fastcheckout bridge', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const placeOrderResult = await page.evaluate(() => new Promise((resolve) => {
            window.require([
                'jquery',
                'Magento_Checkout/js/model/quote',
                'Magento_Checkout/js/action/select-billing-address',
                'Magento_Checkout/js/action/select-shipping-method',
                'Magento_Checkout/js/action/set-shipping-information',
                'Magento_Checkout/js/action/set-payment-information',
                'Magento_Checkout/js/action/place-order',
                'Magento_Checkout/js/model/payment-service',
                'Magento_Checkout/js/model/shipping-service',
                'Magento_Checkout/js/model/payment/place-order-hooks',
                'Magento_Checkout/js/model/full-screen-loader',
                'Magento_Ui/js/model/messageList',
                'mage/storage'
            ], (
                $,
                quote,
                selectBillingAddress,
                selectShippingMethod,
                setShippingInformation,
                setPaymentInformation,
                placeOrderAction,
                paymentService,
                shippingService,
                placeOrderHooks,
                fullScreenLoader,
                messageList,
                storage
            ) => {
                const waitForPromise = (deferred) => new Promise((resolveDeferred, rejectDeferred) => {
                    $.when(deferred)
                        .done((response) => resolveDeferred(response))
                        .fail((error) => rejectDeferred(error || new Error('Deferred rejected')));
                });

                const address = {
                    firstname: 'Ko',
                    lastname: 'Placeorder',
                    company: '',
                    street: ['Test Street 12'],
                    city: 'Warszawa',
                    postcode: '00-001',
                    countryId: 'PL',
                    country_id: 'PL',
                    region: '',
                    regionId: null,
                    region_id: null,
                    telephone: '123456789',
                    saveInAddressBook: null,
                    getType: () => 'new-customer-address',
                    canUseForBilling: () => true
                };

                const pickShippingMethod = () => {
                    const current = quote.shippingMethod && quote.shippingMethod();
                    const serviceRates = typeof shippingService.getShippingRates === 'function'
                        ? shippingService.getShippingRates()()
                        : [];

                    if (current && current.carrier_code && current.method_code) {
                        return current;
                    }

                    return serviceRates && serviceRates.length ? serviceRates[0] : null;
                };

                const pickPaymentMethod = () => {
                    const current = quote.paymentMethod && quote.paymentMethod();
                    const methods = typeof paymentService.getAvailablePaymentMethods === 'function'
                        ? paymentService.getAvailablePaymentMethods()
                        : [];

                    if (current && current.method) {
                        return current.method;
                    }

                    return methods && methods.length && methods[0].method ? methods[0].method : '';
                };

                const getWireSnapshot = () => {
                    const el = document.querySelector('[wire\\:id]');
                    const livewire = window.Livewire || window.Magewire;
                    const wire = el && livewire && typeof livewire.find === 'function'
                        ? livewire.find(el.getAttribute('wire:id'))
                        : null;

                    if (!wire) {
                        return {};
                    }

                    const get = (name) => {
                        if (typeof wire[name] !== 'undefined') {
                            return wire[name];
                        }
                        return typeof wire.get === 'function' ? wire.get(name) : undefined;
                    };

                    return {
                        paymentMethod: get('paymentMethod'),
                        paymentAdditionalData: get('paymentAdditionalData'),
                        paymentExtensionAttributes: get('paymentExtensionAttributes'),
                        placeOrderRequestHeaders: get('placeOrderRequestHeaders'),
                        placeOrderRequestData: get('placeOrderRequestData')
                    };
                };

                (async () => {
                    let originalPost;
                    let capturedRequest = null;
                    const initialModifierCount = placeOrderHooks.requestModifiers.length;
                    const initialAfterListenerCount = placeOrderHooks.afterRequestListeners.length;
                    let requestModifierCalls = 0;
                    let afterRequestCalls = 0;

                    try {
                        if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                            fullScreenLoader.stopLoader(true);
                        }

                        quote.shippingAddress(address);
                        selectBillingAddress(address);
                        quote.guestEmail = 'ko-place-order@example.com';

                        if (
                            window.fastcheckoutHyvaShipping &&
                            typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction === 'function'
                        ) {
                            await window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(address);
                        }

                        const shippingMethod = pickShippingMethod();
                        if (!shippingMethod) {
                            resolve({
                                ok: false,
                                step: 'pickShippingMethod'
                            });
                            return;
                        }

                        selectShippingMethod(shippingMethod);
                        await waitForPromise(setShippingInformation());

                        const paymentMethod = pickPaymentMethod();
                        if (!paymentMethod) {
                            resolve({
                                ok: false,
                                step: 'pickPaymentMethod'
                            });
                            return;
                        }

                        await waitForPromise(setPaymentInformation(messageList, {
                            method: paymentMethod,
                            additional_data: {
                                ko_set_payment_test: 'yes'
                            }
                        }));

                        originalPost = storage.post;
                        storage.post = function (url, data, global, contentType, headers) {
                            const deferred = $.Deferred();
                            capturedRequest = {
                                url,
                                payload: typeof data === 'string' ? JSON.parse(data) : data,
                                global,
                                contentType,
                                headers: headers || {}
                            };
                            window.setTimeout(() => {
                                deferred.resolve({
                                    responseType: 'success',
                                    orderId: 'fastcheckout-ko-test'
                                });
                            }, 0);
                            return deferred.promise();
                        };

                        const paymentData = {
                            method: paymentMethod,
                            additional_data: {
                                ko_place_order_test: 'yes'
                            },
                            extension_attributes: {
                                ko_place_order_test: 'yes'
                            }
                        };

                        placeOrderHooks.requestModifiers.push((headers, payload) => {
                            requestModifierCalls += 1;
                            headers['X-Fastcheckout-KO-Hook'] = 'yes';
                            payload.paymentMethod.additional_data = payload.paymentMethod.additional_data || {};
                            payload.paymentMethod.additional_data.ko_hook_modifier = 'yes';
                            payload.paymentMethod.additional_data.ko_hook_counter =
                                (payload.paymentMethod.additional_data.ko_hook_counter || 0) + 1;
                            payload.paymentMethod.extension_attributes = payload.paymentMethod.extension_attributes || {};
                            payload.paymentMethod.extension_attributes.ko_hook_modifier = 'yes';
                        });
                        placeOrderHooks.afterRequestListeners.push(() => {
                            afterRequestCalls += 1;
                        });

                        const response = await waitForPromise(placeOrderAction(paymentData, messageList));
                        const wireSnapshot = getWireSnapshot();

                        resolve({
                            ok: true,
                            response,
                            request: capturedRequest,
                            wire: wireSnapshot,
                            hookCalls: {
                                requestModifiers: requestModifierCalls,
                                afterRequestListeners: afterRequestCalls
                            },
                            messages: {
                                hasErrors: messageList && typeof messageList.hasMessages === 'function'
                                    ? messageList.hasMessages()
                                    : false,
                                errors: messageList && typeof messageList.errorMessages === 'function'
                                    ? messageList.errorMessages()
                                    : [],
                                success: messageList && typeof messageList.successMessages === 'function'
                                    ? messageList.successMessages()
                                    : []
                            }
                        });
                    } catch (error) {
                        resolve({
                            ok: false,
                            step: 'exception',
                            message: error && (error.message || error.statusText || String(error))
                        });
                    } finally {
                        if (originalPost) {
                            storage.post = originalPost;
                        }
                        placeOrderHooks.requestModifiers.splice(initialModifierCount);
                        placeOrderHooks.afterRequestListeners.splice(initialAfterListenerCount);
                        if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                            fullScreenLoader.stopLoader(true);
                        }
                    }
                })();
            }, (error) => {
                resolve({
                    ok: false,
                    step: 'require',
                    message: error && (error.requireModules || error.message || String(error))
                });
            });
        }));

        expect(placeOrderResult, JSON.stringify(placeOrderResult, null, 2)).toMatchObject({
            ok: true,
            response: {
                responseType: 'success',
                orderId: 'fastcheckout-ko-test'
            },
        });
        expect(placeOrderResult.messages.errors).toEqual([]);
        expect(placeOrderResult.request.url).toContain('/payment-information');
        expect(placeOrderResult.request.payload.email).toBe('ko-place-order@example.com');
        expect(placeOrderResult.request.payload.paymentMethod.additional_data.ko_place_order_test).toBe('yes');
        expect(placeOrderResult.request.payload.paymentMethod.additional_data.ko_hook_modifier).toBe('yes');
        expect(placeOrderResult.request.payload.paymentMethod.extension_attributes.ko_place_order_test).toBe('yes');
        expect(placeOrderResult.request.payload.paymentMethod.extension_attributes.ko_hook_modifier).toBe('yes');
        expect(placeOrderResult.request.headers['X-Fastcheckout-KO-Hook']).toBe('yes');
        expect(placeOrderResult.request.payload.paymentMethod.additional_data.ko_hook_counter).toBe(1);
        expect(placeOrderResult.hookCalls.requestModifiers).toBeGreaterThanOrEqual(2);
        expect(placeOrderResult.hookCalls.afterRequestListeners).toBeGreaterThanOrEqual(1);
        expect(placeOrderResult.wire.paymentMethod).toBe(placeOrderResult.request.payload.paymentMethod.method);
        expect(placeOrderResult.wire.placeOrderRequestData.paymentMethod.additional_data.ko_place_order_test).toBe('yes');
        expect(placeOrderResult.wire.placeOrderRequestData.paymentMethod.additional_data.ko_hook_modifier).toBe('yes');
        expect(placeOrderResult.wire.placeOrderRequestData.paymentMethod.additional_data.ko_hook_counter).toBe(1);
        expect(placeOrderResult.wire.placeOrderRequestData.paymentMethod.extension_attributes.ko_place_order_test).toBe('yes');
        expect(placeOrderResult.wire.placeOrderRequestData.paymentMethod.extension_attributes.ko_hook_modifier).toBe('yes');
        expect(placeOrderResult.wire.placeOrderRequestHeaders['X-Fastcheckout-KO-Hook']).toBe('yes');
    });

    test('should validate input validation rules on blur', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        // Blur empty required field to trigger validation message
        const emailInput = page.locator(selectors.email);
        await emailInput.focus();
        await emailInput.blur();

        const errorMsg = page.locator('label:has(input[data-wire-field="email"]) .field-error');
        await expect(errorMsg).toBeVisible();
        await expect(emailInput).toHaveClass(/border-red-400/);
    });

    test('should allow guest checkout flow with manual input', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await checkout.fillShippingAddress({
            email: 'guest@example.com',
            firstname: 'John',
            lastname: 'Doe',
            street1: 'Test Street 12',
            city: 'New York',
            postcode: '10001',
            telephone: '123456789'
        });

        // Verify order summary displays items
        await expect(page.locator(selectors.cartItemsList)).toBeVisible();

        // Try placing order (will load or trigger order failure since gateway is dummy)
        await checkout.placeOrder();
    });

    test('should restore and clear sessionStorage fields correctly', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        // Fill one field
        await page.locator(selectors.firstname).fill('SessionStorageTest');
        await page.locator(selectors.firstname).blur();
        await page.waitForTimeout(1000);

        // Reload page
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // Check if value restored from sessionStorage (give brief delay for restore timeout)
        await page.waitForTimeout(1000);
        await expect(page.locator(selectors.firstname)).toHaveValue('SessionStorageTest');
    });

    test('should support address autofill for logged-in customers', async ({ page }) => {
        // Assume customer is logged in or session is populated
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        const savedSelect = page.locator(selectors.savedAddresses);
        if (await savedSelect.isVisible()) {
            await checkout.selectSavedAddress(1);
            
            // Wait for fields to populate
            await page.waitForTimeout(500);
            
            // Assert populated fields are not empty
            await expect(page.locator(selectors.firstname)).not.toBeEmpty();
            await expect(page.locator(selectors.lastname)).not.toBeEmpty();
            await expect(page.locator(selectors.street1)).not.toBeEmpty();
        }
    });

    test('should apply discount coupon successfully', async ({ page }) => {
        const checkout = new CheckoutPage(page);
        await checkout.goto();

        await checkout.applyCoupon('CHAT10');
        // Expect coupon message container or total update
        const couponSuccess = page.locator(selectors.couponSuccess);
        await expect(couponSuccess).toBeVisible();
    });
});
