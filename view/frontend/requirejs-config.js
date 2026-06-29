var config = {
    config: {
        mixins: {
            'Magento_Checkout/js/checkout-data': {
                'Kkkonrad_Fastcheckout/js/mixin/checkout-data-mixin': true
            },
            'Magento_Checkout/js/action/select-payment-method': {
                'Magento_SalesRule/js/action/select-payment-method-mixin': false
            },
            'Magento_Checkout/js/action/select-billing-address': {
                'Kkkonrad_Fastcheckout/js/mixin/select-billing-address-mixin': true
            },
            'Magento_Checkout/js/action/place-order': {
                'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin': true
            },
            'PayPal_Braintree/js/view/payment/adapter': {
                'Kkkonrad_Fastcheckout/js/mixin/braintree-adapter-mixin': true
            }
        }
    }
};
