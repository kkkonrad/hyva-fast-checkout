define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Magento_SalesRule wraps select-payment-method and POSTs set-payment-information
     * on every call. Fastcheckout (and multiple payment renderers) often re-select the
     * same method many times in one click — coalesce identical / in-flight requests.
     */
    var lastMethodKey = '',
        lastAt = 0,
        lastResult = null,
        inFlightKey = '',
        inFlightPromise = null,
        // Identical method within this window reuses the last successful result.
        DEDUPE_MS = 2000;

    function methodKey(paymentData, skipBilling) {
        var method = paymentData && paymentData.method ? String(paymentData.method) : '';

        return method + '|' + (skipBilling ? '1' : '0');
    }

    return function (setPaymentInformationExtendedAction) {
        return wrapper.wrap(
            setPaymentInformationExtendedAction,
            function (originalAction, messageContainer, paymentData, skipBilling) {
                var key,
                    now,
                    deferred;

                if (!isFastcheckoutActive()) {
                    return originalAction(messageContainer, paymentData, skipBilling);
                }

                key = methodKey(paymentData, skipBilling);
                now = Date.now();

                // Same method already in flight — share one XHR.
                if (key && key === inFlightKey && inFlightPromise) {
                    return inFlightPromise;
                }

                // Same method just completed successfully — skip a new round-trip.
                if (
                    key &&
                    key === lastMethodKey &&
                    lastResult &&
                    (now - lastAt) < DEDUPE_MS
                ) {
                    deferred = $.Deferred();
                    deferred.resolve(lastResult);
                    return deferred.promise();
                }

                inFlightKey = key;
                inFlightPromise = $.when(
                    originalAction(messageContainer, paymentData, skipBilling)
                ).done(function (result) {
                    lastMethodKey = key;
                    lastAt = Date.now();
                    lastResult = result;
                }).always(function () {
                    if (inFlightKey === key) {
                        inFlightKey = '';
                        inFlightPromise = null;
                    }
                });

                return inFlightPromise;
            }
        );
    };
});
