define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectBillingAddress) {
        return wrapper.wrap(selectBillingAddress, function (originalSelectBillingAddress, billingAddress) {
            if (isFastcheckoutActive() && billingAddress && typeof billingAddress.getCacheKey !== 'function') {
                billingAddress.getCacheKey = function () {
                    return 'billing-address-placeholder';
                };
            }
            return originalSelectBillingAddress(billingAddress);
        });
    };
});
