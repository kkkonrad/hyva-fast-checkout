define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (setPaymentInformationExtendedAction) {
        return wrapper.wrap(setPaymentInformationExtendedAction, function (originalAction, messageContainer, paymentData, skipBilling) {
            if (
                isFastcheckoutActive() &&
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
