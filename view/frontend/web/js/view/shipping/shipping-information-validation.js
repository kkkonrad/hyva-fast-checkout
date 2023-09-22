define(
    [
        'uiComponent',
        'Magento_Checkout/js/model/payment/additional-validators',
        'IWD_Opc/js/model/shipping/shipping-information-validator',
        'Magento_Checkout/js/model/quote'
    ],
    function (Component, additionalValidators, shippingValidator, quote) {
        'use strict';
        if (!quote.isVirtual()) {
            additionalValidators.registerValidator(shippingValidator);
        }

        return Component.extend({});
    }
);
