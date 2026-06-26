define([
    'ko',
    'jquery',
    'uiComponent',
    'Kkkonrad_Fastcheckout/js/model/login/messageList'
], function (ko, $, Component, messageList) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/errors'
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
