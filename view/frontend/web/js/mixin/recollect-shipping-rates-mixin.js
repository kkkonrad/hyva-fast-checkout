define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (recollectShippingRatesAction) {
        return wrapper.wrap(recollectShippingRatesAction, function (originalAction) {
            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onRecollectShippingRatesAction === 'function'
            ) {
                return window.fastcheckoutHyvaShipping.onRecollectShippingRatesAction(originalAction);
            }

            return originalAction();
        });
    };
});
