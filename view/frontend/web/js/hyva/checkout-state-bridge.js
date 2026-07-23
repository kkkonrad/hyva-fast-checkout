define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-state-refresh-coordinator'
], function ($, refreshCoordinator) {
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
            lastMethodsJson = '';

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

        function numericEqual(a, b) {
            var na = Number(a),
                nb = Number(b);

            if (isNaN(na) && isNaN(nb)) {
                return true;
            }

            return Math.abs(na - nb) < 0.00001;
        }

        /**
         * True when the rates list should be replaced in KO.
         * Compare only what shoppers see (identity + price + labels). Ignore extension
         * attribute noise — Magento recollects often attach different bags and that was
         * reloading the whole shipping list on first method pick.
         */
        function shippingRatesChanged(currentRates, nextRates) {
            var i,
                cr,
                nr,
                currentMap = {},
                nextMap = {},
                code;

            currentRates = Array.isArray(currentRates) ? currentRates : [];
            nextRates = Array.isArray(nextRates) ? nextRates : [];

            if (currentRates.length !== nextRates.length) {
                return true;
            }

            if (!currentRates.length) {
                return false;
            }

            for (i = 0; i < currentRates.length; i++) {
                cr = currentRates[i] || {};
                code = String(cr.carrier_code || '') + '_' + String(cr.method_code || '');
                currentMap[code] = cr;
            }

            for (i = 0; i < nextRates.length; i++) {
                nr = nextRates[i] || {};
                code = String(nr.carrier_code || '') + '_' + String(nr.method_code || '');
                nextMap[code] = nr;
                cr = currentMap[code];
                if (!cr) {
                    return true;
                }
                if (
                    !numericEqual(cr.amount, nr.amount) ||
                    !numericEqual(cr.base_amount, nr.base_amount) ||
                    !numericEqual(cr.price_excl_tax, nr.price_excl_tax) ||
                    !numericEqual(cr.price_incl_tax, nr.price_incl_tax) ||
                    Boolean(cr.available) !== Boolean(nr.available) ||
                    String(cr.error_message || '') !== String(nr.error_message || '') ||
                    String(cr.carrier_title || '') !== String(nr.carrier_title || '') ||
                    String(cr.method_title || '') !== String(nr.method_title || '')
                ) {
                    return true;
                }
            }

            for (code in currentMap) {
                if (Object.prototype.hasOwnProperty.call(currentMap, code) && !nextMap[code]) {
                    return true;
                }
            }

            return false;
        }

        function syncShippingRates(rates) {
            var currentRates;

            if (!Array.isArray(rates)) {
                return;
            }

            currentRates = shippingService.getShippingRates()();

            if (shippingRatesChanged(currentRates, rates)) {
                shippingService.setShippingRates(rates);
            }
        }

        function applyPayload(payload, options) {
            var methodsJson,
                selectedPaymentMethod,
                selectedShippingMethod;

            options = options || {};

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

            // Method selection only needs totals/payment — never rebuild the rates list.
            if (options.skipShippingRates !== true) {
                syncShippingRates(payload.shipping_rates);
            }

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

        function refresh(force) {
            var wire = call('getMagewireComponent');

            if (!wire || typeof wire.call !== 'function') {
                applyPayload(null);
                return Promise.resolve(false);
            }

            return refreshCoordinator.refresh(wire, {
                force: force === true,
                fetchState: fetchState
            })
                .then(function (payload) {
                    applyPayload(payload);
                    return payload;
                });
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
            // Method selection must not flash the shipping list loader / rebuild rates.
            if (window.fastcheckoutLockShippingRatesList || window.fastcheckoutSelectingShippingMethod) {
                return Promise.resolve(null);
            }

            if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                shippingService.isLoading(true);
            }

            return refresh(true)
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
            methods = domMethods.filter(function (method) {
                return !method.disabled;
            }).map(function (method) {
                return {
                    method: method.method,
                    title: method.title
                };
            });
            currentMethodsJson = JSON.stringify(methods);
            quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';

            if (quoteMethod && !call('domHasPaymentMethod', quoteMethod)) {
                // Drop stale KO quote method (e.g. after shipping→payment remap).
                // Must NOT call selectPaymentMethodAction(null): its bridge handler
                // hides payment panels and causes open→close→open flicker.
                call('setQuotePaymentMethodFromBridge', null);
                call('persistPaymentMethodToCheckoutData', null);
            }

            if (currentMethodsJson === lastMethodsJson) {
                call('syncKoPaymentRenderers');
                return domMethods;
            }
            lastMethodsJson = currentMethodsJson;

            if (methods.length > 0 || domMethods.length > 0) {
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
