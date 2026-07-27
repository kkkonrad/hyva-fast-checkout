define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            paymentService = deps.paymentService,
            methodConverter = deps.methodConverter,
            quote = deps.quote,
            shippingService = deps.shippingService,
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
            quoteMethod = quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()
                ? quote.paymentMethod().method
                : '';

            if (quoteMethod && !call('domHasPaymentMethod', quoteMethod)) {
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
                fallbackMethods = methodConverter(
                    config.paymentMethods ||
                    (window.checkoutConfig && window.checkoutConfig.paymentMethods) ||
                    []
                );
                paymentService.setPaymentMethods(fallbackMethods);
            }

            window.setTimeout(function () {
                call('syncKoPaymentRenderers');
            }, 0);

            return domMethods;
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
            syncPaymentMethods: syncPaymentMethods,
            applyInitialShippingRates: applyInitialShippingRates,
            bootstrapDefaultDestinationRates: bootstrapDefaultDestinationRates
        };
    };
});
