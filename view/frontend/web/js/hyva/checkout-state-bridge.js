define([
    'Magento_Checkout/js/model/payment/method-list'
], function (methodList) {
    'use strict';

    /**
     * Checkout state helpers.
     *
     * Payment methods source of truth (priority):
     *  1. Magento method-list (filled by get-payment-information / setPaymentMethods)
     *  2. Initial checkoutConfig / bridge config seed (when REST has not run yet)
     *
     * DOM radios are a presentation layer: sync FROM the service list, never INTO it.
     * Fastcheckout shipping→payment mapping still only toggles DOM allowed flags
     * (shipping-method-sync); it must not invent method-list entries.
     */
    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            paymentService = deps.paymentService,
            methodConverter = deps.methodConverter,
            quote = deps.quote,
            shippingService = deps.shippingService,
            selectShippingMethodAction = deps.selectShippingMethodAction,
            callbacks = deps.callbacks || {},
            lastMethodsJson = '',
            seededFromConfig = false;

        function call(name) {
            var callback = callbacks[name],
                args = Array.prototype.slice.call(arguments, 1);

            if (typeof callback === 'function') {
                return callback.apply(null, args);
            }

            return undefined;
        }

        /**
         * @returns {Array<{method: string, title?: string}>}
         */
        function readMethodList() {
            try {
                if (methodList && typeof methodList === 'function') {
                    return methodList() || [];
                }
            } catch (e) {
                // non-fatal
            }

            return [];
        }

        /**
         * Normalize converter/config payloads to {method, title} rows.
         *
         * @param {Array|*} raw
         * @returns {Array}
         */
        function normalizeMethodRows(raw) {
            var rows = [],
                list = Array.isArray(raw) ? raw : [];

            list.forEach(function (item) {
                var code,
                    title;

                if (!item) {
                    return;
                }
                if (typeof item === 'string') {
                    code = item;
                    title = item;
                } else {
                    code = String(item.method || item.code || '');
                    title = String(item.title || item.method_title || code);
                }
                if (!code) {
                    return;
                }
                rows.push({
                    method: code,
                    title: title
                });
            });

            return rows;
        }

        /**
         * Seed Magento method-list once from checkoutConfig when REST has not
         * populated it yet (first paint before set-shipping-information).
         *
         * @returns {Array}
         */
        function seedFromConfigIfEmpty() {
            var current = readMethodList(),
                raw,
                converted;

            if (current.length) {
                return normalizeMethodRows(current);
            }

            if (seededFromConfig) {
                return normalizeMethodRows(readMethodList());
            }

            raw = config.paymentMethods ||
                (window.checkoutConfig && window.checkoutConfig.paymentMethods) ||
                [];

            if (!raw || !raw.length || !paymentService || typeof paymentService.setPaymentMethods !== 'function') {
                seededFromConfig = true;

                return [];
            }

            try {
                converted = typeof methodConverter === 'function'
                    ? methodConverter(raw)
                    : normalizeMethodRows(raw);
            } catch (e) {
                converted = normalizeMethodRows(raw);
            }

            if (converted && converted.length) {
                paymentService.setPaymentMethods(converted);
            }
            seededFromConfig = true;

            return normalizeMethodRows(readMethodList());
        }

        /**
         * Canonical payment methods for Fastcheckout UI + KO renderers.
         *
         * @returns {Array<{method: string, title?: string}>}
         */
        function getCanonicalPaymentMethods() {
            var fromList = normalizeMethodRows(readMethodList());

            if (fromList.length) {
                return fromList;
            }

            return seedFromConfigIfEmpty();
        }

        /**
         * Push Magento method-list → Fastcheckout SSR radio grid (create missing
         * rows, never delete method-list entries based on DOM).
         *
         * @param {Array} methods
         */
        function syncDomFromCanonical(methods) {
            call('syncDomPaymentMethodsFromService', methods || getCanonicalPaymentMethods());
        }

        /**
         * Align paymentService + DOM + KO with Magento as source of truth.
         * Does NOT overwrite method-list with DOM radios.
         *
         * @returns {Array}
         */
        function syncPaymentMethods() {
            var methods,
                currentMethodsJson,
                quoteMethod,
                availableCodes = {},
                allowedCodes;

            call('syncQuoteCustomerData');
            methods = getCanonicalPaymentMethods();
            currentMethodsJson = JSON.stringify(methods.map(function (m) {
                return m.method;
            }));

            methods.forEach(function (m) {
                if (m && m.method) {
                    availableCodes[m.method] = true;
                }
            });

            quoteMethod = quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()
                ? quote.paymentMethod().method
                : '';

            // Mapping may disallow a method that is still on Magento's list.
            allowedCodes = call('getAllowedPaymentCodes');
            if (quoteMethod) {
                if (!availableCodes[quoteMethod]) {
                    call('setQuotePaymentMethodFromBridge', null);
                    call('persistPaymentMethodToCheckoutData', null);
                } else if (
                    Array.isArray(allowedCodes) &&
                    allowedCodes.length > 0 &&
                    allowedCodes.indexOf(quoteMethod) === -1
                ) {
                    call('setQuotePaymentMethodFromBridge', null);
                    call('persistPaymentMethodToCheckoutData', null);
                }
            }

            // Presentation: ensure SSR radios exist for every Magento method.
            if (currentMethodsJson !== lastMethodsJson) {
                lastMethodsJson = currentMethodsJson;
                syncDomFromCanonical(methods);
            } else {
                // Still re-apply visibility (mapping may have changed without list change).
                syncDomFromCanonical(methods);
            }

            window.setTimeout(function () {
                call('syncKoPaymentRenderers');
            }, 0);

            return methods;
        }

        /**
         * Called after Magento get-payment-information updates method-list.
         *
         * @returns {Array}
         */
        function onPaymentMethodsUpdated() {
            // Allow a later config seed only if list becomes empty again (rare).
            if (readMethodList().length) {
                seededFromConfig = true;
            }

            return syncPaymentMethods();
        }

        function applyInitialShippingRates() {
            var activeCode,
                found = null,
                initial = window.fastcheckoutInitialShippingRates;

            if (!Array.isArray(initial) || !initial.length) {
                return false;
            }

            shippingService.setShippingRates(initial);
            activeCode = window.fastcheckoutInitialShippingMethod;
            if (activeCode) {
                initial.forEach(function (rate) {
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

            return true;
        }

        /**
         * When initial rates are empty, seed the quote with Magento's configured
         * default destination and let the native REST estimator populate rates.
         */
        function bootstrapDefaultDestinationRates() {
            var existing,
                countryId,
                postcode,
                regionId,
                city,
                formData;

            try {
                existing = shippingService.getShippingRates()() || [];
            } catch (e) {
                existing = [];
            }
            if (existing.length) {
                return Promise.resolve(existing);
            }

            countryId = (window.checkoutConfig && window.checkoutConfig.defaultCountryId) || '';
            postcode = (window.checkoutConfig && window.checkoutConfig.defaultPostcode) || '';
            regionId = (window.checkoutConfig && window.checkoutConfig.defaultRegionId) || '';
            city = (window.checkoutConfig && window.checkoutConfig.defaultCity) || '';

            if (window.fastcheckoutDefaultDestination) {
                countryId = window.fastcheckoutDefaultDestination.countryId || countryId;
                postcode = window.fastcheckoutDefaultDestination.postcode || postcode;
                regionId = window.fastcheckoutDefaultDestination.regionId || regionId;
                city = window.fastcheckoutDefaultDestination.city || city;
            }
            if (!countryId) {
                return Promise.resolve([]);
            }

            formData = {
                country_id: countryId,
                countryId: countryId,
                postcode: postcode || '',
                region_id: regionId || '',
                regionId: regionId || '',
                city: city || '',
                street: ['', '']
            };

            if (
                !window.fastcheckoutHyvaShipping ||
                typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction !== 'function'
            ) {
                return Promise.resolve([]);
            }

            return new Promise(function (resolve) {
                require([
                    'Magento_Checkout/js/model/address-converter',
                    'Magento_Checkout/js/action/select-shipping-address'
                ], function (addressConverter, selectShippingAddressAction) {
                    var quoteAddress;

                    try {
                        quoteAddress = addressConverter.formAddressDataToQuoteAddress(formData);
                        selectShippingAddressAction(quoteAddress);
                    } catch (e) {
                        quoteAddress = formData;
                    }

                    Promise.resolve(
                        window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(quoteAddress)
                    ).then(function (rates) {
                        rates = Array.isArray(rates) ? rates : [];
                        if (
                            rates.length &&
                            shippingService &&
                            typeof shippingService.setShippingRates === 'function'
                        ) {
                            shippingService.setShippingRates(rates);
                        }
                        resolve(rates);
                    }, function () {
                        resolve([]);
                    });
                }, function () {
                    Promise.resolve(
                        window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(formData)
                    ).then(function (rates) {
                        resolve(Array.isArray(rates) ? rates : []);
                    }, function () {
                        resolve([]);
                    });
                });
            });
        }

        return {
            getCanonicalPaymentMethods: getCanonicalPaymentMethods,
            seedFromConfigIfEmpty: seedFromConfigIfEmpty,
            syncPaymentMethods: syncPaymentMethods,
            onPaymentMethodsUpdated: onPaymentMethodsUpdated,
            applyInitialShippingRates: applyInitialShippingRates,
            bootstrapDefaultDestinationRates: bootstrapDefaultDestinationRates
        };
    };
});
