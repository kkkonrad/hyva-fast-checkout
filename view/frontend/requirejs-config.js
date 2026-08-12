var config = {
    config: {
        mixins: {
            'Magento_Checkout/js/action/place-order': {
                'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin': true
            },
            'Magento_Checkout/js/model/error-processor': {
                'Kkkonrad_Fastcheckout/js/mixin/error-processor-mixin': true
            },
            'Magento_Checkout/js/model/step-navigator': {
                'Kkkonrad_Fastcheckout/js/mixin/step-navigator-mixin': true
            },
            'Magento_Checkout/js/view/payment': {
                'Kkkonrad_Fastcheckout/js/mixin/payment-visibility-mixin': true
            },
            'Magento_Checkout/js/action/set-payment-information-extended': {
                'Kkkonrad_Fastcheckout/js/mixin/set-payment-information-extended-mixin': true
            },
            'Magento_Checkout/js/view/summary/abstract-total': {
                'Kkkonrad_Fastcheckout/js/mixin/summary-total-mixin': true
            },
            'Magento_Checkout/js/view/summary/cart-items': {
                'Kkkonrad_Fastcheckout/js/mixin/summary-cart-items-mixin': true
            },
            'Magento_SalesRule/js/view/payment/discount': {
                'Kkkonrad_Fastcheckout/js/mixin/discount-visibility-mixin': true
            },
            'Magento_CheckoutAgreements/js/view/checkout-agreements': {
                'Kkkonrad_Fastcheckout/js/mixin/checkout-agreements-mixin': true
            },
            'PayPal_Braintree/js/view/payment/method-renderer/hosted-fields': {
                'Kkkonrad_Fastcheckout/js/mixin/braintree-hosted-fields-mixin': true
            }
        }
    }
};
