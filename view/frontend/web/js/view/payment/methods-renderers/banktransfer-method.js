define(
    [
        'ko',
        'Magento_OfflinePayments/js/view/payment/method-renderer/banktransfer-method'
    ],
    function (ko, Component) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/banktransfer'
            }
        });
    }
);
