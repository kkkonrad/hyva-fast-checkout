define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            paymentService = deps.paymentService,
            methodConverter = deps.methodConverter,
            quote = deps.quote,
            checkoutTotals = deps.checkoutTotals,
            shippingService = deps.shippingService,
            selectPaymentMethodAction = deps.selectPaymentMethodAction,
            selectShippingMethodAction = deps.selectShippingMethodAction,
            callbacks = deps.callbacks || {},
            lastMethodsJson = '',
            refreshPromise = null,
            lastPayload = null,
            lastPayloadAt = 0;

        function call(name) {
            var callback = callbacks[name],
                args = Array.prototype.slice.call(arguments, 1);

            if (typeof callback === 'function') {
                return callback.apply(null, args);
            }

            return undefined;
        }

        function getStateSelectedPaymentMethod(payload) {
            if (!payload || typeof payload !== 'object') {
                return '';
            }

            if (payload.selected_payment_method) {
                return String(payload.selected_payment_method);
            }

            if (payload.selectedPaymentMethod) {
                return String(payload.selectedPaymentMethod);
            }

            if (payload.paymentMethod && typeof payload.paymentMethod === 'string') {
                return payload.paymentMethod;
            }

            if (payload.paymentMethod && typeof payload.paymentMethod === 'object' && payload.paymentMethod.method) {
                return String(payload.paymentMethod.method);
            }

            return '';
        }

        function getStateSelectedShippingMethod(payload) {
            if (!payload || typeof payload !== 'object') {
                return '';
            }

            if (payload.selected_shipping_method) {
                return String(payload.selected_shipping_method);
            }

            if (payload.selectedShippingMethod) {
                return String(payload.selectedShippingMethod);
            }

            if (payload.selected_shipping_rate) {
                return String(payload.selected_shipping_rate);
            }

            if (payload.selectedShippingRate) {
                return String(payload.selectedShippingRate);
            }

            if (payload.shippingMethod && typeof payload.shippingMethod === 'string') {
                return payload.shippingMethod;
            }

            if (payload.shippingMethod && typeof payload.shippingMethod === 'object') {
                return call('getShippingMethodCode', payload.shippingMethod) || '';
            }

            return '';
        }

        function syncShippingRates(rates) {
            var currentRates,
                ratesChanged = false,
                i,
                cr,
                nr;

            if (!Array.isArray(rates)) {
                return;
            }

            currentRates = shippingService.getShippingRates()();

            if (currentRates.length !== rates.length) {
                ratesChanged = true;
            } else {
                for (i = 0; i < currentRates.length; i++) {
                    cr = currentRates[i];
                    nr = rates[i];
                    if (cr.carrier_code !== nr.carrier_code ||
                        cr.method_code !== nr.method_code ||
                        cr.amount !== nr.amount ||
                        cr.base_amount !== nr.base_amount ||
                        cr.price_excl_tax !== nr.price_excl_tax ||
                        cr.price_incl_tax !== nr.price_incl_tax ||
                        cr.available !== nr.available ||
                        cr.error_message !== nr.error_message ||
                        cr.carrier_title !== nr.carrier_title ||
                        cr.method_title !== nr.method_title ||
                        JSON.stringify(cr.extension_attributes || {}) !== JSON.stringify(nr.extension_attributes || {}) ||
                        JSON.stringify(cr.extensionAttributes || {}) !== JSON.stringify(nr.extensionAttributes || {})) {
                        ratesChanged = true;
                        break;
                    }
                }
            }

            if (ratesChanged) {
                shippingService.setShippingRates(rates);
            }
        }

        function applyPayload(payload) {
            var methodsJson,
                selectedPaymentMethod,
                selectedShippingMethod;

            if (!payload || typeof payload !== 'object') {
                call('syncQuoteTotalsFromDom');
                syncPaymentMethods();
                return false;
            }

            if (payload.totals) {
                call('syncQuoteTotals', payload.totals);
            } else {
                call('syncQuoteTotalsFromDom');
            }

            if (Array.isArray(payload.payment_methods)) {
                paymentService.setPaymentMethods(payload.payment_methods);
                methodsJson = JSON.stringify(payload.payment_methods);
                if (methodsJson) {
                    lastMethodsJson = methodsJson;
                }
            } else {
                syncPaymentMethods();
            }

            syncShippingRates(payload.shipping_rates);

            selectedPaymentMethod = getStateSelectedPaymentMethod(payload);
            if (selectedPaymentMethod) {
                call('setQuotePaymentMethodFromBridge', {
                    method: selectedPaymentMethod
                });
                call('persistPaymentMethodToCheckoutData', selectedPaymentMethod);
            }

            selectedShippingMethod = getStateSelectedShippingMethod(payload);
            if (selectedShippingMethod) {
                call('syncSelectedShippingMethodToKnockout', selectedShippingMethod);
            }

            if (payload.customer_email) {
                call('setQuoteGuestEmail', payload.customer_email);
                call('persistEmailToCheckoutData', payload.customer_email);
            }

            if (typeof payload.coupon_code !== 'undefined' && window.checkoutConfig && window.checkoutConfig.totalsData) {
                window.checkoutConfig.totalsData.coupon_code = payload.coupon_code || '';
            }

            return true;
        }

        function getStateUrl(wire) {
            var baseUrl = window.BASE_URL || '/',
                paymentMethod = wire ? call('getProperty', wire, 'paymentMethod') : '';

            if (baseUrl.charAt(baseUrl.length - 1) !== '/') {
                baseUrl += '/';
            }

            return baseUrl + 'fast-checkout/index/state' + (paymentMethod ? '?payment_method=' + encodeURIComponent(paymentMethod) : '');
        }

        function fetchState(wire) {
            return $.ajax({
                url: getStateUrl(wire),
                type: 'GET',
                dataType: 'json',
                cache: false
            });
        }

        function refresh() {
            var wire = call('getMagewireComponent');

            if (!wire || typeof wire.call !== 'function') {
                applyPayload(null);
                return Promise.resolve(false);
            }

            if (lastPayload && Date.now() - lastPayloadAt < 750) {
                return Promise.resolve(lastPayload);
            }

            if (refreshPromise) {
                return refreshPromise;
            }

            refreshPromise = Promise.resolve(wire.call('refreshCheckoutState'))
                .then(function (payload) {
                    if (payload && typeof payload === 'object' && payload.totals) {
                        return payload;
                    }
                    return fetchState(wire);
                })
                .catch(function () {
                    return fetchState(wire);
                })
                .then(function (payload) {
                    applyPayload(payload);
                    lastPayload = payload;
                    lastPayloadAt = Date.now();
                    return payload;
                })
                .then(function (payload) {
                    refreshPromise = null;
                    return payload;
                }, function (error) {
                    refreshPromise = null;
                    throw error;
                });

            return refreshPromise;
        }

        function resolveRefresh(refreshCallbacks, deferred, messageContainer) {
            var proceed = true;

            refreshCallbacks = Array.isArray(refreshCallbacks) ? refreshCallbacks : [];
            deferred = deferred || $.Deferred();

            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                checkoutTotals.isLoading(true);
            }

            refresh()
                .then(function (payload) {
                    refreshCallbacks.forEach(function (callback) {
                        if (typeof callback === 'function') {
                            proceed = proceed && callback();
                        }
                    });

                    if (!proceed) {
                        deferred.reject();
                        return;
                    }

                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(false);
                    }
                    deferred.resolve(payload);
                })
                .catch(function (error) {
                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(false);
                    }
                    call('handlePaymentError', error, messageContainer || call('getBridgeMessageContainer'));
                    deferred.reject(error);
                });

            return deferred.promise();
        }

        function refreshShippingRates() {
            if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                shippingService.isLoading(true);
            }

            return refresh()
                .then(function (payload) {
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(false);
                    }
                    return payload;
                })
                .catch(function (error) {
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(false);
                    }
                    call('handlePaymentError', error, call('getBridgeMessageContainer'));
                    throw error;
                });
        }

        function syncPaymentMethods() {
            var domMethods,
                methods,
                currentMethodsJson,
                quoteMethod,
                fallbackMethods;

            call('syncQuoteCustomerData');
            domMethods = call('getDomPaymentMethods') || [];
            methods = domMethods.map(function (method) {
                return {
                    method: method.method,
                    title: method.title
                };
            });
            currentMethodsJson = JSON.stringify(methods);
            quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';

            if (quoteMethod && !call('domHasPaymentMethod', quoteMethod)) {
                selectPaymentMethodAction(null);
                call('persistPaymentMethodToCheckoutData', null);
                call('hidePaymentPlaceholders');
            }

            if (currentMethodsJson === lastMethodsJson) {
                call('syncKoPaymentRenderers');
                return domMethods;
            }
            lastMethodsJson = currentMethodsJson;

            if (methods.length > 0) {
                paymentService.setPaymentMethods(methods);
            } else {
                fallbackMethods = methodConverter(config.paymentMethods || window.checkoutConfig.paymentMethods || []);
                paymentService.setPaymentMethods(fallbackMethods);
            }

            window.setTimeout(function () {
                call('syncKoPaymentRenderers');
            }, 0);

            return domMethods;
        }

        function applyInitialShippingRates() {
            var activeCode,
                found = null;

            if (!window.fastcheckoutInitialShippingRates || !Array.isArray(window.fastcheckoutInitialShippingRates)) {
                return;
            }

            shippingService.setShippingRates(window.fastcheckoutInitialShippingRates);
            activeCode = window.fastcheckoutInitialShippingMethod;
            if (!activeCode) {
                return;
            }

            window.fastcheckoutInitialShippingRates.forEach(function (rate) {
                if (rate.carrier_code + '_' + rate.method_code === activeCode) {
                    found = rate;
                }
            });
            if (found) {
                try {
                    window.fastcheckoutSuppressShippingSync = true;
                    selectShippingMethodAction(found);
                } finally {
                    window.fastcheckoutSuppressShippingSync = false;
                }
            }
        }

        return {
            applyPayload: applyPayload,
            refresh: refresh,
            fetchState: fetchState,
            resolveRefresh: resolveRefresh,
            refreshShippingRates: refreshShippingRates,
            syncPaymentMethods: syncPaymentMethods,
            applyInitialShippingRates: applyInitialShippingRates
        };
    };
});
