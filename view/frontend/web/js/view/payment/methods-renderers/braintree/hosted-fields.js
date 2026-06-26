define([
    'PayPal_Braintree/js/view/payment/method-renderer/hosted-fields',
    'mage/translate'
], function (Component, $t) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/payment/methods-renderers/braintree/form',
            isCurrentlySecure: window.checkoutConfig.iwdOpcSettings.isCurrentlySecure
        },
        getHostedFields: function () {
            var self = this;
            var fields = self._super();
            if (fields.cvv) {
                fields.cvv.placeholder = $t('CVV') + ' *';
            }

            return fields;
        }
    });
});
