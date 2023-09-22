define([
    'PayPal_Braintree/js/view/payment/adapter',
    'Magento_Checkout/js/model/payment/additional-validators',
    'PayPal_Braintree/js/view/payment/method-renderer/paypal',
    'mage/translate'
], function (Braintree, additionalValidators, Component, $t) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/payment/methods-renderers/braintree/paypal'
        },
        getInstructions: function () {
            return $t('After clicking "Place Order", you will be directed to one of our trusted partners to complete your purchase.');
        },
        isSkipOrderReview: function () {
            return true;
        },
        /**
         * Triggers when customer click "Continue to PayPal" button
         */
        payWithPayPal: function () {
            if (additionalValidators.validate()) {
                try {
                    Braintree.checkout.paypal.initAuthFlow();
                } catch (e) {
                    this.messageContainer.addErrorMessage({
                        message: $t('Payment ' + this.getTitle() + ' can\'t be initialized.')
                    });
                }
            }
        },

        getButtonId: function () {
            return  (this.item && this.item.method) ? this.item.method : 'braintree_paypal';
        },

        getButtonTitle: function () {
            return (this.item && this.item.title) ? this.item.title : 'Paypal';
        },
    });
});
