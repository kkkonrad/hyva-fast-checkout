define([
    'Magento_Checkout/js/model/quote',
    'mage/translate'
], function (quote, $t) {
    'use strict';

    return function (Component) {
        return Component.extend({
            getEmptyPaymentMessage: function () {
                var settings = window.checkoutConfig.fastcheckoutSettings || {};

                if (settings.paymentFilteringEnabled && !quote.isVirtual() && !quote.shippingMethod()) {
                    return $t('Select a shipping method to see the available payment methods.');
                }

                return $t('No Payment method available.');
            }
        });
    };
});
