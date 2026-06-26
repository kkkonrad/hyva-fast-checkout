define(
    [
        'Magento_Worldpay/js/view/payment/method-renderer/worldpay',
        'mage/translate'
    ],
    function (Component, $t) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/payment/methods-renderers/worldpay-form'
            },
            getInstructions: function () {
                return $t('After clicking "Place Order", you will be directed to one of our trusted partners to complete your purchase.');
            }
        });
    }
);
