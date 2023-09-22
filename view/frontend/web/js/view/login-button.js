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
            template: 'IWD_Opc/login-button',
            isShowLoginButton: quote.isShowLoginButton(),
            isCustomerLoggedIn: quote.isCustomerLoggedIn(),
            logoutUrl: quote.getLogoutUrl()
        }
    });
});
