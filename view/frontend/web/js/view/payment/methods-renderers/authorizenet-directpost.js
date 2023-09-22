define(
    [
        'jquery',
        'Magento_Authorizenet/js/view/payment/method-renderer/authorizenet-directpost'
    ],
    function ($, Component) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/authorizenet-directpost',
                isCurrentlySecure: window.checkoutConfig.iwdOpcSettings.isCurrentlySecure
            }
        });
    }
);
