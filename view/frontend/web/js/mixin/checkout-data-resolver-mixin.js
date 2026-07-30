define([
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/checkout-data',
    'Magento_Checkout/js/model/address-converter',
    'Magento_Customer/js/customer-data',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, quote, checkoutData, addressConverter, customerData, isFastcheckoutActive) {
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
        if (window.fastcheckoutOrderPlaced) {
            return;
        }

        if (checkoutData && typeof checkoutData[method] === 'function' && value) {
            checkoutData[method](value);
        }
    }

    function hasAddressData(value) {
        return value && typeof value === 'object' && Object.keys(value).length > 0;
    }

    function normalizeAddressValue(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function addressesMatch(left, right) {
        var leftStreet = left.street || {},
            rightStreet = right.street || {},
            fields = ['firstname', 'lastname', 'city', 'postcode', 'telephone'];

        return fields.every(function (field) {
            return normalizeAddressValue(left[field]) === normalizeAddressValue(right[field]);
        }) &&
            normalizeAddressValue(left.country_id || left.countryId) ===
                normalizeAddressValue(right.country_id || right.countryId) &&
            normalizeAddressValue(Object.values(leftStreet).filter(Boolean).join(' ')) ===
                normalizeAddressValue(Object.values(rightStreet).filter(Boolean).join(' '));
    }

    function clearStaleNewCustomerAddress(resolver) {
        var config = window.checkoutConfig || {},
            addresses = (config.customerData || {}).addresses || {},
            addressKeys = Object.keys(addresses),
            newAddress = checkoutData.getNewCustomerShippingAddress(),
            formAddress = checkoutData.getShippingAddressFromData(),
            address = newAddress || formAddress,
            customerAddressId = address && (address.customer_address_id || address.customerAddressId),
            street = address && address.street || {},
            isSavedAddress,
            storeCode = config.storeCode || 'default',
            quoteAddress,
            savedAddress;

        if (!config.isCustomerLoggedIn || !addressKeys.length || !address) {
            return;
        }

        isSavedAddress = addressKeys.some(function (key) {
            return customerAddressId &&
                String(addresses[key].id || key) === String(customerAddressId) ||
                addressesMatch(address, addresses[key]);
        });

        if (!isSavedAddress && address.city && address.postcode &&
            Object.keys(street).some(function (key) {
                return String(street[key] || '').trim();
            })) {
            return;
        }

        address = customerData.get('checkout-data')() || {};
        address.newCustomerShippingAddress = address.newCustomerShippingAddress || {};
        address.shippingAddressFromData = address.shippingAddressFromData || {};
        address.newCustomerShippingAddress[storeCode] = null;
        address.shippingAddressFromData[storeCode] = null;
        if (address.selectedShippingAddress === 'new-customer-address') {
            address.selectedShippingAddress = null;
        }
        customerData.set('checkout-data', address);

        quoteAddress = typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
        if (
            quoteAddress &&
            typeof quoteAddress.getType === 'function' &&
            quoteAddress.getType() === 'new-customer-address' &&
            addressKeys.some(function (key) {
                return addressesMatch(quoteAddress, addresses[key]);
            })
        ) {
            savedAddress = resolver &&
                typeof resolver.getShippingAddressFromCustomerAddressList === 'function'
                ? resolver.getShippingAddressFromCustomerAddressList()
                : null;
            if (savedAddress) {
                quote.shippingAddress(savedAddress);
                if (typeof checkoutData.setSelectedShippingAddress === 'function') {
                    checkoutData.setSelectedShippingAddress(savedAddress.getKey());
                }
            }
        }
    }

    function ensureCustomerNameData() {
        var config = window.checkoutConfig || {},
            customer = config.customerData || {},
            addressData,
            changed = false;

        if (!config.isCustomerLoggedIn || Object.keys(customer.addresses || {}).length) {
            return;
        }

        addressData = Object.assign(
            {},
            config.shippingAddressFromData || {},
            checkoutData.getShippingAddressFromData() || {}
        );

        ['firstname', 'lastname'].forEach(function (field) {
            if (!addressData[field] && customer[field]) {
                addressData[field] = customer[field];
                changed = true;
            }
        });

        if (changed) {
            config.shippingAddressFromData = addressData;
            safeSet('setShippingAddressFromData', addressData);
        }
    }

    function ensureAddressData(resolver) {
        var shippingAddress,
            billingAddress,
            shippingAddressData,
            billingAddressData;

        if (!isFastcheckoutActive() || window.fastcheckoutOrderPlaced || !quote) {
            return;
        }

        clearStaleNewCustomerAddress(resolver);
        ensureCustomerNameData();

        shippingAddress = typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
        billingAddress = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

        if (
            shippingAddress &&
            checkoutData &&
            !hasAddressData(checkoutData.getShippingAddressFromData()) &&
            !(
                window.checkoutConfig.isCustomerLoggedIn &&
                typeof shippingAddress.getType === 'function' &&
                shippingAddress.getType() === 'customer-address'
            )
        ) {
            shippingAddressData = getAddressData(shippingAddress);
            safeSet('setShippingAddressFromData', shippingAddressData);
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
            ensureAddressData(resolver);

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
