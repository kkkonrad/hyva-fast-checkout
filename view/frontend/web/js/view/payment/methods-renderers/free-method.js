define(
    [
        'Magento_Payment/js/view/payment/method-renderer/free-method'
    ],
    function (Component) {
        'use strict';
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/payment/methods-renderers/free'
            }
        });
    }
);
