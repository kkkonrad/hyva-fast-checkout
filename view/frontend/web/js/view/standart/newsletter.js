define(
    [
        'ko',
        'uiComponent',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/checkout-data'
    ],
    function (ko, Component, quote, checkoutData) {
        "use strict";

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/standart/newsletter'
            },
            isShowSubscribe: quote.isShowSubscribe(),
            isSubscribe: ko.observable(checkoutData.getIsSubscribe()),

            initialize: function () {
                this._super();
                var self = this;
                this.isSubscribe.subscribe(function (value) {
                    checkoutData.setIsSubscribe(value);
                });
            }
        });
    }
);