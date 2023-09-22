define(
    [
        'jquery',
        'uiRegistry',
        'Magento_Checkout/js/model/quote'
    ],
    function ($, registry, quote) {
        'use strict';

        return {
            validate: function () {

                return true;

                var billingAddress;
                if (quote.isVirtual()) {
                    billingAddress = registry.get('checkout.steps.billing-step-virtual.billing-address-form');
                } else {
                    billingAddress = registry.get('checkout.steps.billing-step.payment.billing-address-form');
                    if (!billingAddress && quote.paymentMethod()) {
                        billingAddress = registry.get('checkout.steps.billing-step.payment.payments-list.' + quote.paymentMethod().method + '-form');
                    }
                }

                if (!billingAddress || billingAddress.isAddressSameAsShipping() || !billingAddress.isAddressFormVisible()) {
                    return true;
                }

                billingAddress.canHideErrors = false;
                return billingAddress.validateFields(true);
            }
        };
    }
);
