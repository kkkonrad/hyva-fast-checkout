define(
    [
        'uiComponent',
        'Magento_Checkout/js/model/payment/additional-validators',
        'Kkkonrad_Fastcheckout/js/model/payment/payment-method-validator',
        'Magento_Checkout/js/model/quote'
    ],
    function (Component, additionalValidators, paymentValidator, quote) {
        'use strict';
        additionalValidators.registerValidator(paymentValidator);

        return Component.extend({});
    }
);
