define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (getTotalsAction) {
        return wrapper.wrap(getTotalsAction, function (originalAction, callbacks, deferred) {
            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onGetTotalsAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onGetTotalsAction(
                    callbacks,
                    deferred,
                    originalAction
                );
            }

            return originalAction(callbacks, deferred);
        });
    };
});
