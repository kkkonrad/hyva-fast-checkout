define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    function getMethodCode(shippingMethod) {
        var shipping = window.fastcheckoutHyvaShipping;

        if (shipping && typeof shipping.getShippingMethodCode === 'function') {
            return shipping.getShippingMethodCode(shippingMethod) || '';
        }

        if (!shippingMethod) {
            return '';
        }
        if (typeof shippingMethod === 'string') {
            return shippingMethod;
        }
        if (shippingMethod.carrier_code && shippingMethod.method_code) {
            return shippingMethod.carrier_code + '_' + shippingMethod.method_code;
        }

        return shippingMethod.method || '';
    }

    return function (selectShippingMethodAction) {
        return wrapper.wrap(selectShippingMethodAction, function (originalAction, shippingMethod) {
            var shipping = window.fastcheckoutHyvaShipping,
                methodCode;

            // Hard-block Magento rate-resolver / checkoutData overwrites of the locked
            // shopper choice. Do NOT re-enter selectShippingMethod here (that caused loops).
            if (
                isFastcheckoutActive() &&
                !window.fastcheckoutSuppressShippingSync &&
                shipping &&
                typeof shipping.shouldIgnoreKnockoutApply === 'function'
            ) {
                methodCode = getMethodCode(shippingMethod);
                if (methodCode && shipping.shouldIgnoreKnockoutApply(methodCode)) {
                    return;
                }
            }

            var result = originalAction(shippingMethod);

            if (
                isFastcheckoutActive() &&
                !window.fastcheckoutSuppressShippingSync &&
                shipping &&
                typeof shipping.onSelectShippingMethodAction === 'function'
            ) {
                shipping.onSelectShippingMethodAction(shippingMethod);
            }

            return result;
        });
    };
});
