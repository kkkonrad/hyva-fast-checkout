define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onPlaceOrderAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onPlaceOrderAction(paymentData, messageContainer, originalAction);
            }
            return originalAction(paymentData, messageContainer);
        });
    };
});
