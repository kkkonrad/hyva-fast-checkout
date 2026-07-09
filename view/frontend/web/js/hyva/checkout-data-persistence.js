define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var checkoutData = deps.checkoutData,
            fallbackWarningShown = false;

        function getStoreCode() {
            return (window.checkoutConfig && window.checkoutConfig.storeCode) || 'default';
        }

        function readFallback() {
            var cache;

            try {
                cache = window.localStorage ? JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}') : {};
            } catch (e) {
                cache = {};
            }

            return {
                cache: cache,
                data: cache['checkout-data'] || {}
            };
        }

        function writeFallback(data) {
            var fallback = readFallback();

            fallback.cache['checkout-data'] = data;

            try {
                if (window.localStorage) {
                    window.localStorage.setItem('mage-cache-storage', JSON.stringify(fallback.cache));
                }
            } catch (e) {}
        }

        function updateFallback(update) {
            var fallback = readFallback();

            update(fallback.data);
            writeFallback(fallback.data);
        }

        function setAddressByStore(currentValue, addressData) {
            var byStore = currentValue || {};

            byStore[getStoreCode()] = addressData;
            return byStore;
        }

        function safeSet(methodName, value, fallback) {
            if (checkoutData && typeof checkoutData[methodName] === 'function') {
                try {
                    window.fastcheckoutSuppressCheckoutDataBridge = true;
                    checkoutData[methodName](value);
                    return;
                } catch (e) {
                    if (!fallbackWarningShown && window.console && typeof window.console.warn === 'function') {
                        fallbackWarningShown = true;
                        window.console.warn(
                            'Kkkonrad Fastcheckout: checkout-data storage is not ready, using local fallback.',
                            e
                        );
                    }
                } finally {
                    window.fastcheckoutSuppressCheckoutDataBridge = false;
                }
            }

            if (typeof fallback === 'function') {
                fallback(value);
            }
        }

        function persistEmail(email) {
            if (!email) {
                return;
            }

            safeSet('setValidatedEmailValue', email, function (value) {
                updateFallback(function (data) {
                    data.validatedEmailValue = value;
                });
            });
            safeSet('setInputFieldEmailValue', email, function (value) {
                updateFallback(function (data) {
                    data.inputFieldEmailValue = value;
                });
            });
        }

        function persistAddress(addressData, type) {
            if (!addressData) {
                return;
            }

            if (type === 'billing') {
                safeSet('setBillingAddressFromData', addressData, function (value) {
                    updateFallback(function (data) {
                        data.billingAddressFromData = value;
                    });
                });
                safeSet('setNewCustomerBillingAddress', addressData, function (value) {
                    updateFallback(function (data) {
                        data.newCustomerBillingAddress = value;
                    });
                });
                return;
            }

            safeSet('setShippingAddressFromData', addressData, function (value) {
                updateFallback(function (data) {
                    data.shippingAddressFromData = setAddressByStore(data.shippingAddressFromData, value);
                });
            });
            safeSet('setNewCustomerShippingAddress', addressData, function (value) {
                updateFallback(function (data) {
                    data.newCustomerShippingAddress = setAddressByStore(data.newCustomerShippingAddress, value);
                });
            });
        }

        function persistShippingMethod(methodCode) {
            safeSet('setSelectedShippingRate', methodCode || null, function (value) {
                updateFallback(function (data) {
                    data.selectedShippingRate = value;
                });
            });
        }

        function persistPaymentMethod(methodCode) {
            safeSet('setSelectedPaymentMethod', methodCode || null, function (value) {
                updateFallback(function (data) {
                    data.selectedPaymentMethod = value;
                });
            });
        }

        return {
            persistEmail: persistEmail,
            persistAddress: persistAddress,
            persistShippingMethod: persistShippingMethod,
            persistPaymentMethod: persistPaymentMethod
        };
    };
});
