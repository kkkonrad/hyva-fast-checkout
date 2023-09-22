define([
    'ko',
    'jquery',
    'uiComponent',
    'Magento_GiftCardAccount/js/model/payment/gift-card-messages'
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
            return this.messageContainer.hasMessages();
        },

        removeAll: function () {
            this.messageContainer.clear();
        }
    });
});
