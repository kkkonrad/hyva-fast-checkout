define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (getTotalsAction) {
        return wrapper.wrap(getTotalsAction, function (originalAction, callbacks, deferred) {
            if (
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
