define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (recollectShippingRatesAction) {
        return wrapper.wrap(recollectShippingRatesAction, function (originalAction) {
            if (window.fastcheckoutLockShippingRatesList || window.fastcheckoutSelectingShippingMethod) {
                return;
            }
            return originalAction();
        });
    };
});
