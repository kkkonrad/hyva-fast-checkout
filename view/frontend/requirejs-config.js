var config = {
    config: {
        mixins: {
            'Magento_Checkout/js/action/place-order': {
                'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin': true
            },
            'Magento_Checkout/js/model/payment-service': {
                'Kkkonrad_Fastcheckout/js/mixin/payment-service-mixin': true
            },
            'Magento_Checkout/js/view/summary/abstract-total': {
                'Kkkonrad_Fastcheckout/js/mixin/summary-total-mixin': true
            },
            'Magento_Checkout/js/view/summary/cart-items': {
                'Kkkonrad_Fastcheckout/js/mixin/summary-cart-items-mixin': true
            },
            'Magento_SalesRule/js/view/payment/discount': {
                'Kkkonrad_Fastcheckout/js/mixin/discount-visibility-mixin': true
            }
        }
    }
};
