define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Native Magento totals pipeline — do not replace with Magewire refresh.
     * Coalesce concurrent / back-to-back get-totals calls (SalesRule fires one
     * after every set-payment-information; payment re-select storms multiplied them).
     */
    var inFlight = null,
        lastAt = 0,
        // Align with set-payment-information-extended dedupe window so SalesRule's
        // getTotals after every coalesced set-payment does not re-fetch.
        COALESCE_MS = 2000;

    return function (getTotalsAction) {
        return wrapper.wrap(getTotalsAction, function (originalAction, callbacks, deferred) {
            var now,
                result;

            if (!isFastcheckoutActive()) {
                return originalAction(callbacks, deferred);
            }

            now = Date.now();

            if (inFlight) {
                if (deferred && typeof deferred.resolve === 'function') {
                    inFlight.always(function () {
                        deferred.resolve();
                    });
                }
                return inFlight;
            }

            // Very recent successful fetch — skip (totals already current).
            if (lastAt && (now - lastAt) < COALESCE_MS) {
                if (deferred && typeof deferred.resolve === 'function') {
                    deferred.resolve();
                }
                if (Array.isArray(callbacks)) {
                    callbacks.forEach(function (cb) {
                        if (typeof cb === 'function') {
                            try {
                                cb();
                            } catch (e) {
                                // ignore
                            }
                        }
                    });
                }
                return $.Deferred().resolve().promise();
            }

            result = originalAction(callbacks, deferred);
            inFlight = $.when(result).always(function () {
                inFlight = null;
                lastAt = Date.now();
            });

            return inFlight;
        });
    };
});
