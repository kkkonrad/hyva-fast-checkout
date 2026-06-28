define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            // Check if our custom checkout is active and has a handler
            if (window.fastcheckoutHyvaPayment && typeof window.fastcheckoutHyvaPayment.onPlaceOrderAction === 'function') {
                return window.fastcheckoutHyvaPayment.onPlaceOrderAction(paymentData, messageContainer, originalAction);
            }
            return originalAction(paymentData, messageContainer);
        });
    };
});
