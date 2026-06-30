define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (getPaymentInformationAction) {
        return wrapper.wrap(getPaymentInformationAction, function (originalAction, deferred, messageContainer) {
            if (
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
