define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var placeOrderHooks = deps.placeOrderHooks;

        function clonePaymentPayload(paymentData) {
            if (!paymentData || typeof paymentData !== 'object') {
                return paymentData || {};
            }

            return $.extend(true, {}, paymentData);
        }

        function runAfterRequestListeners() {
            if (!placeOrderHooks || !Array.isArray(placeOrderHooks.afterRequestListeners)) {
                return;
            }

            placeOrderHooks.afterRequestListeners.forEach(function (listener) {
                if (typeof listener === 'function') {
                    try {
                        listener();
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: place-order after request listener failed.', e);
                        }
                    }
                }
            });
        }

        return {
            clonePaymentPayload: clonePaymentPayload,
            runAfterRequestListeners: runAfterRequestListeners
        };
    };
});
