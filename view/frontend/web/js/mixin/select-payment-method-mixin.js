define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectPaymentMethodAction) {
        return wrapper.wrap(selectPaymentMethodAction, function (originalAction, paymentMethod) {
            var result = originalAction(paymentMethod);

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction === 'function'
            ) {
                window.fastcheckoutHyvaPayment.onSelectPaymentMethodAction(paymentMethod);
            }

            return result;
        });
    };
});
