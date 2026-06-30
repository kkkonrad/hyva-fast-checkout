define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setPaymentInformationAction) {
        return wrapper.wrap(setPaymentInformationAction, function (originalAction, messageContainer, paymentData) {
            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSetPaymentInformationAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onSetPaymentInformationAction(
                    messageContainer,
                    paymentData,
                    false,
                    originalAction
                );
            }

            return originalAction(messageContainer, paymentData);
        });
    };
});
