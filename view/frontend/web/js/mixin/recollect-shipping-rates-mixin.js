define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (recollectShippingRatesAction) {
        return wrapper.wrap(recollectShippingRatesAction, function (originalAction) {
            if (
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onRecollectShippingRatesAction === 'function'
            ) {
                return window.fastcheckoutHyvaShipping.onRecollectShippingRatesAction(originalAction);
            }

            return originalAction();
        });
    };
});
