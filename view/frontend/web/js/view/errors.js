define([
    'ko',
    'jquery',
    'uiComponent',
    'Magento_Ui/js/model/messageList'
], function (ko, $, Component, globalMessages) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/general-errors',
            selector: '.iwd_opc_general_errors'
        },

        initialize: function (config, messageContainer) {
            this._super();

            this.messageContainer = messageContainer || config.messageContainer || globalMessages;

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
