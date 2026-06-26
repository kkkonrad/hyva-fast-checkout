define(
    [
        'uiComponent',
        'Magento_Checkout/js/model/payment/additional-validators',
        'Kkkonrad_Fastcheckout/js/model/billing/address-validator',
        'Magento_Checkout/js/model/quote'
    ],
    function (Component, additionalValidators, billingValidator, quote) {
        'use strict';
        additionalValidators.registerValidator(billingValidator);
        return Component.extend({});
    }
);
