define(
    [
        'Magento_Paypal/js/view/payment/method-renderer/in-context/checkout-express',
        'mage/translate'
    ],
    function (Component, $t) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/paypal-express-in-context'
            },
            getInstructions: function () {
                return $t('After clicking "Place Order", you will be directed to one of our trusted partners to complete your purchase.');
            }
        });
    }
);
