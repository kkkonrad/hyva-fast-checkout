define(
    [
        'jquery',
        'uiRegistry'
    ],
    function ($, registry) {
        'use strict';

        return {
            validate: function () {
                var shippingAddress = registry.get('checkout.steps.shipping-step.shippingAddress');
                shippingAddress.canHideErrors = false;
                return shippingAddress.validateShippingInformation(true);
            }
        };
    }
);
