define([
    'uiComponent',
    'Magento_Checkout/js/model/payment/additional-validators',
    'Kkkonrad_Fastcheckout/js/model/one-step-validator'
], function (Component, additionalValidators, validator) {
    'use strict';

    additionalValidators.registerValidator(validator);

    return Component.extend({});
});
