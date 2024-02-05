define(
    [
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/shipping-rate-processor/new-address',
        'Magento_Checkout/js/model/shipping-rate-processor/customer-address',
        'Magento_Checkout/js/checkout-data',
        'Magento_Checkout/js/model/shipping-rate-registry',
        'IWD_Opc/js/form/address-manager'
    ],
    function (quote, defaultProcessor, customerAddressProcessor, checkoutData, rateRegistry, iwdOpcAddressManager) {
        'use strict';

        var self = this,
            processors = [];
            processors.default = defaultProcessor;
            processors['customer-address'] = customerAddressProcessor;


        quote.shippingAddress.subscribe(function (shippingAddress) {
            if(shippingAddress.getKey() == 'new-customer-address' && !iwdOpcAddressManager.isNewCustomerAddressValid()) {
                return true;
            }

            if (checkoutData.getNeedEstimateShippingRates()) {
                var type = quote.shippingAddress().getType();
                var address = quote.shippingAddress();

                if (processors[type]) {
                    processors[type].getRates(address);
                } else {
                    processors.default.getRates(address);
                }
            }
        });

        return {
            registerProcessor: function (type, processor) {
                processors[type] = processor;
            }
        }
    }
);
