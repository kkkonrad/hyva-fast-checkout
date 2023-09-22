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
                template: 'IWD_Opc/standart/comment'
            },
            isShowComment: quote.isShowComment(),
            commentValue: ko.observable(checkoutData.getComment()),

            initialize: function () {
                var self = this;
                this._super();
                this.commentValue.subscribe(function (value) {
                    checkoutData.setComment(value);
                });
            }
        });
    }
);