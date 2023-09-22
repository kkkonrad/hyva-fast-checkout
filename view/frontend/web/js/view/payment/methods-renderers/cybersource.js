define(
    [
        'Magento_Cybersource/js/view/payment/method-renderer/cybersource'
    ],
    function ($, Component) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/cybersource-form'
            }
        });
    }
);
