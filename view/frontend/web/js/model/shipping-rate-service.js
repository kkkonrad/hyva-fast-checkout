define(
    [
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/shipping-rate-processor/new-address',
        'Magento_Checkout/js/model/shipping-rate-processor/customer-address',
        'Magento_Checkout/js/checkout-data'
    ],
    function (quote, defaultProcessor, customerAddressProcessor, checkoutData) {
        'use strict';

        var self = this,
            processors = [];
            processors.default = defaultProcessor;
            processors['customer-address'] = customerAddressProcessor;


        function loader(type, timeout = 0) {
            // if(window.fullScreenLoader) {
            //     if(typeof window.checkoutData == 'undefined'){
            //         window.checkoutData = {};
            //     }
            //
            //     setTimeout(function () {
            //         if(type == 'start') {
            //             window.checkoutData.loader = 1;
            //             window.fullScreenLoader.startLoader();
            //         } else if (type == 'stop') {
            //             window.checkoutData.loader = 0;
            //             window.fullScreenLoader.stopLoader();
            //         }
            //     }, timeout)
            // }
        }

        quote.shippingAddress.subscribe(function () {
            loader('start');

            if (checkoutData.getNeedEstimateShippingRates()) {
                var type = quote.shippingAddress().getType();
                var address = quote.shippingAddress();

                if (processors[type]) {
                    processors[type].getRates(address);
                } else {
                    processors.default.getRates(address);
                }
            }

            loader('stop', 1000);
        });

        return {
            registerProcessor: function (type, processor) {
                processors[type] = processor;
            }
        }
    }
);
