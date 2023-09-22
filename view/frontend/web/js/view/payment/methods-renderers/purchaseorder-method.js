define(
    [
        'Magento_OfflinePayments/js/view/payment/method-renderer/purchaseorder-method',
        'jquery',
        'mage/validation'
    ],
    function (Component, $) {
        'use strict';
        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/purchaseorder-form',
                isCurrentlySecure: window.checkoutConfig.iwdOpcSettings.isCurrentlySecure
            }
        });
    }
);
