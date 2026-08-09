define([
    'ko',
    'uiComponent',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (ko, Component, isFastcheckoutActive) {
    'use strict';

    var settings = window.checkoutConfig &&
        window.checkoutConfig.fastcheckoutSettings || {};

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/newsletter',
            visible: isFastcheckoutActive() && Boolean(settings.showSubscribe),
            label: settings.newsletterLabel || 'Sign Up for Our Newsletter'
        },

        initObservable: function () {
            this._super();
            this.isChecked = ko.observable(Boolean(settings.subscribeByDefault));

            return this;
        }
    });
});
