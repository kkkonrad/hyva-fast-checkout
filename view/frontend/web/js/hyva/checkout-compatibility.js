define([], function () {
    'use strict';

    function ensureQuoteAddressMethods(address, cacheKey) {
        if (!address) {
            return address;
        }

        if (typeof address.getType !== 'function') {
            address.getType = function () {
                return 'new-customer-address';
            };
        }
        if (typeof address.getKey !== 'function') {
            address.getKey = function () {
                return this.getType();
            };
        }
        if (typeof address.getCacheKey !== 'function') {
            address.getCacheKey = function () {
                return cacheKey;
            };
        }
        if (typeof address.isEditable !== 'function') {
            address.isEditable = function () {
                return true;
            };
        }
        if (typeof address.canUseForBilling !== 'function') {
            address.canUseForBilling = function () {
                return true;
            };
        }

        return address;
    }

    function createQuoteAddressPlaceholder(cacheKey) {
        return ensureQuoteAddressMethods({
            countryId: window.checkoutConfig && window.checkoutConfig.defaultCountryId || '',
            regionId: window.checkoutConfig && window.checkoutConfig.defaultRegionId || null,
            region: '',
            street: [],
            company: '',
            telephone: '',
            postcode: '',
            city: '',
            firstname: '',
            lastname: '',
            customAttributes: [],
            extensionAttributes: {}
        }, cacheKey);
    }

    function ensureQuoteAddressCacheKey(quote, accessorName, cacheKey) {
        var currentAddress,
            originalAccessor;

        if (!quote || !quote[accessorName]) {
            return;
        }

        currentAddress = quote[accessorName]();
        if (!currentAddress) {
            quote[accessorName](createQuoteAddressPlaceholder(cacheKey));
        } else {
            ensureQuoteAddressMethods(currentAddress, cacheKey);
        }

        originalAccessor = quote[accessorName];
        quote[accessorName] = function (value) {
            if (arguments.length > 0 && value) {
                ensureQuoteAddressMethods(value, cacheKey);
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
