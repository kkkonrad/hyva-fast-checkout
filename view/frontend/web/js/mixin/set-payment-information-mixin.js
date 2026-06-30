define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (setPaymentInformationAction) {
        return wrapper.wrap(setPaymentInformationAction, function (originalAction, messageContainer, paymentData) {
            if (
                isFastcheckoutActive() &&
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
