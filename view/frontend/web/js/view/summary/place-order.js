define(
    [
        'jquery',
        'ko',
        'Magento_Checkout/js/model/quote',
        'mage/translate',
        'Magento_Checkout/js/view/summary'
    ],
    function(
        $,
        ko,
        quote,
        $t,
        Component
    ) {
        'use strict';

        return Component.extend({
            errorValidationMessage: ko.observable(false),
            checkoutData: window.checkoutData,

            placeOrder: function () {
                let self = this,
                    shipping = self.checkoutData.shipping;
                self.errorValidationMessage(false);

                if (!shipping.isAddressHasError()) {
                    if (!quote.shippingMethod()) {
                        this.errorValidationMessage(
                            $t('The shipping method is missing. Select the shipping method and try again.')
                        );

                        this.stopLoader(1000);
                    } else if (!quote.paymentMethod()) {
                        this.errorValidationMessage(
                            $t('The payment method is missing. Select the payment method and try again.')
                        );

                        this.stopLoader(1000);
                    } else {
                        $(".payment-method._active").find('.action.primary.checkout').trigger( 'click' );
                    }
                }
            },

            stopLoader: function(timeout = 2000){
                setTimeout(function () {
                    window.fullScreenLoader.stopLoader();
                },timeout)
            },

            initialize: function () {
                let self = this;

                $(function() {
                    $('body').on("click", '#place-order-trigger', function () {
                        window.checkoutData.payment.placeOrder();
                    });
                });
                self.checkoutData.secondaryPlaceOrder = this;

                this._super().observe({
                    isVisible: false,
                });
            }

        });
    }
);
