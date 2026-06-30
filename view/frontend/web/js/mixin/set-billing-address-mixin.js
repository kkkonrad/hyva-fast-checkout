define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (setBillingAddressAction) {
        return wrapper.wrap(setBillingAddressAction, function (originalAction, messageContainer) {
            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSetBillingAddressAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onSetBillingAddressAction(messageContainer, originalAction);
            }

            return originalAction(messageContainer);
        });
    };
});
