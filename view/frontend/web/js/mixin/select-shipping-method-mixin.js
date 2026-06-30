define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectShippingMethodAction) {
        return wrapper.wrap(selectShippingMethodAction, function (originalAction, shippingMethod) {
            var result = originalAction(shippingMethod);

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onSelectShippingMethodAction === 'function'
            ) {
                window.fastcheckoutHyvaShipping.onSelectShippingMethodAction(shippingMethod);
            }

            return result;
        });
    };
});
