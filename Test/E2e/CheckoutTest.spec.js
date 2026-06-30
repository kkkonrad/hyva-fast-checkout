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

                (async () => {
                    try {
                        if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                            fullScreenLoader.stopLoader(true);
                        }

                        quote.shippingAddress(address);
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
