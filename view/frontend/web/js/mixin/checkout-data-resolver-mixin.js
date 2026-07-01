define([
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/checkout-data',
    'Magento_Checkout/js/model/address-converter',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, quote, checkoutData, addressConverter, isFastcheckoutActive) {
    'use strict';

    function getAddressData(address) {
        if (!address || typeof address !== 'object') {
            return null;
        }

        try {
            return addressConverter.quoteAddressToFormAddressData(address);
        } catch (e) {
            return null;
        }
    }

    function safeSet(method, value) {
        if (checkoutData && typeof checkoutData[method] === 'function' && value) {
            checkoutData[method](value);
        }
    }

    function hasAddressData(value) {
        return value && typeof value === 'object' && Object.keys(value).length > 0;
    }

    function ensureAddressData() {
        var shippingAddress,
            billingAddress,
            shippingAddressData,
            billingAddressData;

        if (!isFastcheckoutActive() || !quote) {
            return;
        }

        shippingAddress = typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
        billingAddress = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

        if (shippingAddress && checkoutData && !hasAddressData(checkoutData.getShippingAddressFromData())) {
            shippingAddressData = getAddressData(shippingAddress);
            safeSet('setShippingAddressFromData', shippingAddressData);
            safeSet('setNewCustomerShippingAddress', shippingAddressData);
        }

        if (billingAddress && checkoutData && !hasAddressData(checkoutData.getBillingAddressFromData())) {
            billingAddressData = getAddressData(billingAddress);
            safeSet('setBillingAddressFromData', billingAddressData);
            safeSet('setNewCustomerBillingAddress', billingAddressData);
        }
    }

    function wrapResolverMethod(resolver, method) {
        if (!resolver || typeof resolver[method] !== 'function') {
            return;
        }

        resolver[method] = wrapper.wrap(resolver[method], function (originalMethod) {
            ensureAddressData();

            return originalMethod.apply(resolver, Array.prototype.slice.call(arguments, 1));
        });
    }

    return function (resolver) {
        if (!resolver || resolver.fastcheckoutCheckoutDataResolverMixinApplied) {
            return resolver;
        }

        resolver.fastcheckoutCheckoutDataResolverMixinApplied = true;

        [
            'resolveEstimationAddress',
            'resolveShippingAddress',
            'applyShippingAddress',
            'resolveBillingAddress',
            'applyBillingAddress'
        ].forEach(function (method) {
            wrapResolverMethod(resolver, method);
        });

        return resolver;
    };
});
