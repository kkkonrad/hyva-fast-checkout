define([
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/checkout-data',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, quote, checkoutData, isFastcheckoutActive) {
    'use strict';

    /**
     * True when checkout-data points at a saved address-book entry.
     *
     * @param {String|null} selectedKey
     * @returns {Boolean}
     */
    function isCustomerAddressKey(selectedKey) {
        return !!(selectedKey && String(selectedKey).indexOf('customer-address') === 0);
    }

    /**
     * Form-field rate validators call selectShippingAddress with a freshly converted
     * new-customer-address whenever checkoutProvider is written. That happens after
     * Fastcheckout syncs the hidden form from a chosen address-book card — and
     * overwrites quote.shippingAddress so neither card appears selected (first click
     * only deselects the previous). Keep the intentional customer-address selection.
     *
     * @param {Object} shippingAddress
     * @returns {Boolean}
     */
    function shouldIgnoreFormDerivedOverwrite(shippingAddress) {
        var selectedKey,
            current;

        if (!isFastcheckoutActive() || !shippingAddress) {
            return false;
        }

        if (
            typeof shippingAddress.getType !== 'function' ||
            shippingAddress.getType() !== 'new-customer-address'
        ) {
            return false;
        }

        try {
            selectedKey = checkoutData && typeof checkoutData.getSelectedShippingAddress === 'function'
                ? checkoutData.getSelectedShippingAddress()
                : null;
        } catch (e) {
            selectedKey = null;
        }

        if (!isCustomerAddressKey(selectedKey)) {
            return false;
        }

        current = quote && typeof quote.shippingAddress === 'function'
            ? quote.shippingAddress()
            : null;

        // Allow overwrite only when quote is empty / already a free-form address.
        if (
            current &&
            typeof current.getType === 'function' &&
            current.getType() === 'customer-address' &&
            typeof current.getKey === 'function' &&
            current.getKey() === selectedKey
        ) {
            return true;
        }

        // Race: selectAddress sets quote first, then selected key. If quote already
        // holds the intended customer-address, still block form clobber.
        if (
            current &&
            typeof current.getType === 'function' &&
            current.getType() === 'customer-address'
        ) {
            return true;
        }

        return false;
    }

    return function (selectShippingAddress) {
        return wrapper.wrap(selectShippingAddress, function (originalSelectShippingAddress, shippingAddress) {
            var result;

            if (shouldIgnoreFormDerivedOverwrite(shippingAddress)) {
                return quote && typeof quote.shippingAddress === 'function'
                    ? quote.shippingAddress()
                    : null;
            }

            result = originalSelectShippingAddress(shippingAddress);

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onSelectShippingAddressAction === 'function'
            ) {
                Promise.resolve(window.fastcheckoutHyvaShipping.onSelectShippingAddressAction(shippingAddress))
                    .catch(function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Fastcheckout: shipping address sync failed.', error);
                        }
                    });
            }

            return result;
        });
    };
});
