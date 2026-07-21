define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectPaymentMethodAction) {
        return wrapper.wrap(selectPaymentMethodAction, function (originalAction, paymentMethod) {
            var bridge = window.fastcheckoutHyvaPayment,
                result;

            // Drop stale KO/renderer selects (previous method still booting) before they
            // overwrite quote.paymentMethod and snap the UI back after a fast re-click.
            if (
                isFastcheckoutActive() &&
                bridge &&
                typeof bridge.shouldAcceptPaymentSelection === 'function' &&
                !bridge.shouldAcceptPaymentSelection(paymentMethod)
            ) {
                return;
            }

            result = originalAction(paymentMethod);

            if (
                isFastcheckoutActive() &&
                bridge &&
                typeof bridge.onSelectPaymentMethodAction === 'function'
            ) {
                bridge.onSelectPaymentMethodAction(paymentMethod);
            }

            return result;
        });
    };
});
