define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (selectPaymentMethodAction) {
        return wrapper.wrap(selectPaymentMethodAction, function (originalAction, paymentMethod) {
            var result = originalAction(paymentMethod);

            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction === 'function'
            ) {
                window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction(paymentMethod);
            }

            return result;
        });
    };
});
