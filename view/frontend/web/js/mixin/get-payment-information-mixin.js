define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * After Magento REST get-payment-information updates method-list + totals,
     * refresh Fastcheckout DOM radios from the service (never the reverse).
     */
    return function (getPaymentInformationAction) {
        return wrapper.wrap(getPaymentInformationAction, function (originalAction, deferred, messageContainer) {
            var result = originalAction(deferred, messageContainer);

            if (!isFastcheckoutActive()) {
                return result;
            }

            function notify() {
                try {
                    if (
                        window.fastcheckoutHyvaPayment &&
                        typeof window.fastcheckoutHyvaPayment.onPaymentMethodsUpdated === 'function'
                    ) {
                        window.fastcheckoutHyvaPayment.onPaymentMethodsUpdated();
                    }
                } catch (e) {
                    // non-fatal
                }
            }

            if (result && typeof result.done === 'function') {
                result.done(notify);
            } else if (deferred && typeof deferred.done === 'function') {
                deferred.done(notify);
            } else {
                $.when(result).done(notify);
            }

            return result;
        });
    };
});
