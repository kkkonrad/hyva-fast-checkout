define([
    'ko',
    'jquery',
    'IWD_ApplePay/js/view/payment/method-renderer/apple_pay',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/payment/additional-validators',
    'uiRegistry',
    'Magento_Checkout/js/action/set-billing-address',
    'Magento_Ui/js/model/messageList',
    'Magento_Checkout/js/action/redirect-on-success'
], function (ko, $, Component, quote, additionalValidators,
             registry, setBillingAddressAction, globalMessageList, redirectOnSuccessAction) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/payment/methods-renderers/apple_pay'
        },
        quoteIsVirtual: quote.isVirtual(),

        initialize: function () {
            this._super();
            var self = this;
            this.isChecked.subscribe(function (value) {
                self.togglePlaceOrderButton(value === self.getCode());
            });
            var isSelectedApplePay = false;
            if (quote && quote.paymentMethod() && quote.paymentMethod().method && quote.paymentMethod().method === self.getCode()) {
                isSelectedApplePay = true;
            }
            self.togglePlaceOrderButton(isSelectedApplePay);
            return this;
        },
        togglePlaceOrderButton: function (showPaymentButton) {
            if (showPaymentButton) {
                $('.iwd_opc_place_order_button').hide();
                $('#iwd_applepay_place_order').show();
            } else {
                $('.iwd_opc_place_order_button').show();
                $('#iwd_applepay_place_order').hide();
            }
        },
        placeOrder: function () {
            var self = this;
            if (!quote.isVirtual()) {
                var shippingAddress = registry.get('checkout.steps.shipping-step.shippingAddress');
                shippingAddress.setShippingInformation().done(function () {
                    self.isPlaceOrderActionAllowed(false);
                    self.getPlaceOrderDeferredObject()
                        .fail(
                            function () {
                                self.isPlaceOrderActionAllowed(true);
                            }
                        ).done(
                        function () {
                            self.afterPlaceOrder();

                            if (self.redirectAfterPlaceOrder) {
                                redirectOnSuccessAction.execute();
                            }
                        }
                    );
                });
            } else {
                setBillingAddressAction(globalMessageList).done(function () {
                    self.isPlaceOrderActionAllowed(false);
                    self.getPlaceOrderDeferredObject()
                        .fail(
                            function () {
                                self.isPlaceOrderActionAllowed(true);
                            }
                        ).done(
                        function () {
                            self.afterPlaceOrder();

                            if (self.redirectAfterPlaceOrder) {
                                redirectOnSuccessAction.execute();
                            }
                        }
                    );
                });
            }
        }
    });
});
