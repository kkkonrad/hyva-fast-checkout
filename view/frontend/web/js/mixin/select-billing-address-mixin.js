define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (selectBillingAddress) {
        return wrapper.wrap(selectBillingAddress, function (originalSelectBillingAddress, billingAddress) {
            // Safely guard against cases where billingAddress is not a proper Magento address object
            // (e.g. if a cached JS file or 3rd party module sets a plain object on the quote)
            if (billingAddress && typeof billingAddress.getCacheKey !== 'function') {
                billingAddress.getCacheKey = function () {
                    return 'billing-address-placeholder';
                };
            }
            return originalSelectBillingAddress(billingAddress);
        });
    };
});
