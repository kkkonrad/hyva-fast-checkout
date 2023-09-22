define([
    'ko',
    'jquery',
    'uiComponent',
    'Magento_SalesRule/js/model/payment/discount-messages'
], function (ko, $, Component, messageList) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/errors'
        },

        initialize: function () {
            this._super()
                .initObservable();

            this.messageContainer = messageList;
            return this;
        },

        initObservable: function () {
            this._super()
                .observe('isHidden');
            return this;
        },

        isVisible: function () {
            if (this.messageContainer.errorMessages()) {
                let errorMessage = this.messageContainer.errorMessages()[0];

                if (typeof errorMessage === 'undefined') {
                    return false;
                }

                if (errorMessage.indexOf('coupon') === -1) {
                    return false;
                }

                return this.messageContainer.hasMessages();
            }

            return false;
        },

        removeAll: function () {
            this.messageContainer.clear();
        }
    });
});
