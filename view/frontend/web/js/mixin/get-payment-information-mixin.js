define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (getPaymentInformationAction) {
        return wrapper.wrap(getPaymentInformationAction, function (originalAction, deferred, messageContainer) {
            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onGetPaymentInformationAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onGetPaymentInformationAction(
                    deferred,
                    messageContainer,
                    originalAction
                );
            }

            return originalAction(deferred, messageContainer);
        });
    };
});
