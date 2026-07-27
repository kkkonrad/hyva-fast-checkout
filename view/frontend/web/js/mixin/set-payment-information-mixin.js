define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Thin pass-through — real coalescing lives on set-payment-information-extended
     * (SalesRule and core both go through that action).
     */
    return function (setPaymentInformationAction) {
        return wrapper.wrap(setPaymentInformationAction, function (originalAction) {
            return originalAction.apply(this, Array.prototype.slice.call(arguments, 1));
        });
    };
});
