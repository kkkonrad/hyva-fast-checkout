define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Native Magento set-shipping-information (REST). No Magewire dual-write.
     */
    return function (setShippingInformationAction) {
        return wrapper.wrap(setShippingInformationAction, function (originalAction) {
            return originalAction();
        });
    };
});
