define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectBillingAddress) {
        return wrapper.wrap(selectBillingAddress, function (originalSelectBillingAddress, billingAddress) {
            var result;

            if (isFastcheckoutActive() && billingAddress && typeof billingAddress.getCacheKey !== 'function') {
                billingAddress.getCacheKey = function () {
                    return 'billing-address-placeholder';
                };
            }

            result = originalSelectBillingAddress(billingAddress);

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onSelectBillingAddressAction === 'function'
            ) {
                Promise.resolve(window.fastcheckoutHyvaShipping.onSelectBillingAddressAction(billingAddress))
                    .catch(function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Fastcheckout: billing address sync failed.', error);
                        }
                    });
            }

            return result;
        });
    };
});
