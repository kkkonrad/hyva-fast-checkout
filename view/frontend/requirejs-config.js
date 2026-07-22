var config = {
    map: {
        '*': {
            // Prefer address/contact autofill on guest email (see template override).
            'Magento_Checkout/template/form/element/email':
                'Kkkonrad_Fastcheckout/template/form/element/email'
        }
    },
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
            'Magento_Checkout/js/action/select-shipping-address': {
                'Kkkonrad_Fastcheckout/js/mixin/select-shipping-address-mixin': true
            },
            'Magento_Checkout/js/action/select-shipping-method': {
                'Kkkonrad_Fastcheckout/js/mixin/select-shipping-method-mixin': true
            },
            'Magento_Checkout/js/action/select-payment-method': {
                'Kkkonrad_Fastcheckout/js/mixin/select-payment-method-mixin': true
            },
            'Magento_Checkout/js/action/set-shipping-information': {
                'Kkkonrad_Fastcheckout/js/mixin/set-shipping-information-mixin': true
            },
            'Magento_Checkout/js/model/shipping-rate-processor/new-address': {
                'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-new-address-mixin': true
            },
            'Magento_Checkout/js/model/shipping-rate-processor/customer-address': {
                'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-customer-address-mixin': true
            },
            'Magento_Checkout/js/model/shipping-rate-service': {
                'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-service-mixin': true
            },
            'Magento_Checkout/js/model/checkout-data-resolver': {
                'Kkkonrad_Fastcheckout/js/mixin/checkout-data-resolver-mixin': true
            },
            'Magento_Checkout/js/action/place-order': {
                'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin': true
            },
            'Magento_Checkout/js/action/redirect-on-success': {
                'Kkkonrad_Fastcheckout/js/mixin/redirect-on-success-mixin': true
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
            },
            'Magento_Checkout/js/view/form/element/email': {
                'Kkkonrad_Fastcheckout/js/mixin/checkout-email-autofill-mixin': true
            },
            'Magento_Checkout/js/view/billing-address': {
                'Kkkonrad_Fastcheckout/js/mixin/billing-address-validation-mixin': true
            },
            // Empty optional fields (street line 2+) stay undefined in provider data;
            // stock max_text_length treats that as invalid ("255 symbols").
            'Magento_Ui/js/lib/validation/rules': {
                'Kkkonrad_Fastcheckout/js/mixin/ui-validation-rules-mixin': true
            }
        }
    }
};
