define([], function () {
    'use strict';

    function ensureQuoteAddressCacheKey(quote, accessorName, cacheKey) {
        var currentAddress,
            originalAccessor;

        if (!quote || !quote[accessorName]) {
            return;
        }

        currentAddress = quote[accessorName]();
        if (currentAddress && typeof currentAddress.getCacheKey !== 'function') {
            currentAddress.getCacheKey = function () {
                return cacheKey;
            };
        }

        originalAccessor = quote[accessorName];
        quote[accessorName] = function (value) {
            if (arguments.length > 0 && value && typeof value.getCacheKey !== 'function') {
                value.getCacheKey = function () {
                    return cacheKey;
                };
            }

            return originalAccessor.apply(this, arguments);
        };
        Object.keys(originalAccessor).forEach(function (key) {
            quote[accessorName][key] = originalAccessor[key];
        });
        quote[accessorName].subscribe = originalAccessor.subscribe.bind(originalAccessor);
    }

    function getCheckoutDataLocalStore() {
        try {
            var raw = window.localStorage ? window.localStorage.getItem('checkout-data') : null;

            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveCheckoutDataLocalStore(data) {
        try {
            if (window.localStorage) {
                window.localStorage.setItem('checkout-data', JSON.stringify(data));
            }
        } catch (e) {}
    }

    function ensureCheckoutDataInPostFallback(checkoutData) {
        if (!checkoutData) {
            return;
        }

        if (typeof checkoutData.setShippingInPostPoint !== 'function') {
            checkoutData.setShippingInPostPoint = function (data) {
                var obj = getCheckoutDataLocalStore();

                obj.shippingInPostPointData = data;
                saveCheckoutDataLocalStore(obj);
            };
        }
        if (typeof checkoutData.getShippingInPostPoint !== 'function') {
            checkoutData.getShippingInPostPoint = function () {
                return getCheckoutDataLocalStore().shippingInPostPointData || null;
            };
        }
        if (typeof checkoutData.setShippingInPostMode !== 'function') {
            checkoutData.setShippingInPostMode = function (data) {
                var obj = getCheckoutDataLocalStore();

                obj.shippingInPostModeData = data;
                saveCheckoutDataLocalStore(obj);
            };
        }
        if (typeof checkoutData.getShippingInPostMode !== 'function') {
            checkoutData.getShippingInPostMode = function () {
                return getCheckoutDataLocalStore().shippingInPostModeData || null;
            };
        }
    }

    return {
        ensureQuoteAddressCacheKeys: function (quote) {
            ensureQuoteAddressCacheKey(quote, 'billingAddress', 'billing-address-placeholder');
            ensureQuoteAddressCacheKey(quote, 'shippingAddress', 'shipping-address-placeholder');
        },
        ensureCheckoutDataInPostFallback: ensureCheckoutDataInPostFallback
    };
});
