define([
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, quote, isFastcheckoutActive) {
    'use strict';

    /**
     * Skip no-op re-selects of the already-active payment method.
     * Magento_SalesRule's select-payment-method mixin POSTs set-payment-information
     * on every invocation — Fastcheckout UI often re-fires select 10+ times per click.
     */
    function methodCode(paymentMethod) {
        if (!paymentMethod) {
            return '';
        }
        if (typeof paymentMethod === 'string') {
            return paymentMethod;
        }

        return paymentMethod.method ? String(paymentMethod.method) : '';
    }

    function quoteMethodCode() {
        var current = quote && typeof quote.paymentMethod === 'function'
            ? quote.paymentMethod()
            : null;

        return methodCode(current);
    }

    return function (selectPaymentMethodAction) {
        return wrapper.wrap(selectPaymentMethodAction, function (originalAction, paymentMethod) {
            var bridge = window.fastcheckoutHyvaPayment,
                code,
                result;

            if (!isFastcheckoutActive()) {
                return originalAction(paymentMethod);
            }

            // Drop stale KO/renderer selects (previous method still booting).
            if (
                bridge &&
                typeof bridge.shouldAcceptPaymentSelection === 'function' &&
                !bridge.shouldAcceptPaymentSelection(paymentMethod)
            ) {
                return;
            }

            code = methodCode(paymentMethod);

            // Already selected on the quote — do not re-enter SalesRule XHR path.
            if (code && code === quoteMethodCode()) {
                if (
                    bridge &&
                    typeof bridge.onSelectPaymentMethodAction === 'function'
                ) {
                    // Still sync DOM / locks without re-selecting on quote.
                    bridge.onSelectPaymentMethodAction(paymentMethod);
                }
                return;
            }

            result = originalAction(paymentMethod);

            if (
                bridge &&
                typeof bridge.onSelectPaymentMethodAction === 'function'
            ) {
                bridge.onSelectPaymentMethodAction(paymentMethod);
            }

            return result;
        });
    };
});
