define(
    [
        'Magento_Eway/js/view/payment/method-renderer/shared',
        'mage/translate'
    ],
    function (Component,
              $t) {
        'use strict';
        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/eway-shared-form'
            },
            getInstructions: function () {
                return $t('After clicking "Place Order", you will be directed to one of our trusted partners to complete your purchase.');
            }
        });
    }
);
