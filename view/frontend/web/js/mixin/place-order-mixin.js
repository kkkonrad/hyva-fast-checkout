define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            // Check if our custom checkout is active and has a handler
            if (window.iwdOpcHyvaPayment && typeof window.iwdOpcHyvaPayment.onPlaceOrderAction === 'function') {
                return window.iwdOpcHyvaPayment.onPlaceOrderAction(paymentData, messageContainer, originalAction);
            }
            return originalAction(paymentData, messageContainer);
        });
    };
});
