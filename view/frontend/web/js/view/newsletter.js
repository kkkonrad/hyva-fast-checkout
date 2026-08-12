define([
    'Magento_Ui/js/form/element/single-checkbox',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (Component, isFastcheckoutActive) {
    'use strict';

    var settings = window.checkoutConfig &&
        window.checkoutConfig.fastcheckoutSettings || {};

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/newsletter',
            provider: 'checkoutProvider',
            dataScope: 'fastcheckout.subscribe',
            visible: isFastcheckoutActive() && Boolean(settings.showSubscribe),
            label: settings.newsletterLabel || 'Sign Up for Our Newsletter',
            default: Boolean(settings.subscribeByDefault),
            valueMap: {
                true: true,
                false: false
            },
            links: {
                value: '${ $.provider }:fastcheckout.subscribe'
            }
        }
    });
});
