var config = {
    config: {
        mixins: {
            'Magento_Checkout/js/checkout-data': {
                'Kkkonrad_Fastcheckout/js/mixin/checkout-data-mixin': true
            },
            'Magento_Customer/js/customer-data': {
                'Kkkonrad_Fastcheckout/js/mixin/customer-data-mixin': true
            },
            'Magento_Checkout/js/action/select-billing-address': {
                'Kkkonrad_Fastcheckout/js/mixin/select-billing-address-mixin': true
            },
            'Magento_Checkout/js/action/select-payment-method': {
                'Kkkonrad_Fastcheckout/js/mixin/select-payment-method-mixin': true
            },
            'Magento_Checkout/js/action/place-order': {
                'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin': true
            },
            'Magento_Checkout/js/action/set-payment-information': {
                'Kkkonrad_Fastcheckout/js/mixin/set-payment-information-mixin': true
            },
            'Magento_Checkout/js/action/set-payment-information-extended': {
                'Kkkonrad_Fastcheckout/js/mixin/set-payment-information-extended-mixin': true
            },
            'Magento_Checkout/js/action/set-billing-address': {
                'Kkkonrad_Fastcheckout/js/mixin/set-billing-address-mixin': true
            },
            'Magento_Checkout/js/action/get-payment-information': {
                'Kkkonrad_Fastcheckout/js/mixin/get-payment-information-mixin': true
            },
            'Magento_Checkout/js/action/get-totals': {
                'Kkkonrad_Fastcheckout/js/mixin/get-totals-mixin': true
            },
            'Magento_Checkout/js/action/recollect-shipping-rates': {
                'Kkkonrad_Fastcheckout/js/mixin/recollect-shipping-rates-mixin': true
            },
            'PayPal_Braintree/js/view/payment/adapter': {
                'Kkkonrad_Fastcheckout/js/mixin/braintree-adapter-mixin': true
            },
            'mage/storage': {
                'Kkkonrad_Fastcheckout/js/mixin/storage-mixin': true
            }
        }
    }
};
