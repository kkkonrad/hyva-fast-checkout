define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Native Magento totals pipeline — do not replace with Magewire refresh.
     */
    return function (getTotalsAction) {
        return wrapper.wrap(getTotalsAction, function (originalAction, callbacks, deferred) {
            return originalAction(callbacks, deferred);
        });
    };
});
