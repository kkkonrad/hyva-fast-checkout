define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setPaymentInformationExtendedAction) {
        return wrapper.wrap(setPaymentInformationExtendedAction, function (originalAction, messageContainer, paymentData, skipBilling) {
            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSetPaymentInformationAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onSetPaymentInformationAction(
                    messageContainer,
                    paymentData,
                    skipBilling,
                    originalAction
                );
            }

            return originalAction(messageContainer, paymentData, skipBilling);
        });
    };
});
