define(
    [
        'mage/translate',
        'Magento_Paypal/js/view/payment/method-renderer/payflowpro-method'
    ],
    function ($t, Component) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/payflowpro-form',
                isCurrentlySecure: window.checkoutConfig.iwdOpcSettings.isCurrentlySecure

            }
        });
    }
);
