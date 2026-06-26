define([
    'ko',
    'jquery',
    'uiComponent',
    'Magento_Checkout/js/model/quote',
    'mage/translate'
], function (ko, $, Component, quote, $t) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/login-button',
            isShowLoginButton: quote.isShowLoginButton(),
            isCustomerLoggedIn: quote.isCustomerLoggedIn(),
            logoutUrl: quote.getLogoutUrl()
        }
    });
});
