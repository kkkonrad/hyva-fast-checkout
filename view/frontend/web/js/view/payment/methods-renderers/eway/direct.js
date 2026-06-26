define(
    [
        'Magento_Eway/js/view/payment/method-renderer/direct'
    ],
    function (ccFormComponent) {
        'use strict';

        return ccFormComponent.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/payment/methods-renderers/eway-direct-form'
            }
        });
    }
);
