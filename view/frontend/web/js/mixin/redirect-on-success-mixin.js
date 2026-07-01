define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    function redirectThroughFastcheckoutBridge() {
        if (
            !isFastcheckoutActive() ||
            !window.fastcheckoutHyvaPayment ||
            typeof window.fastcheckoutHyvaPayment.afterPlaceOrder !== 'function'
        ) {
            return false;
        }

        if (window.fastcheckoutKoSuccessRedirectInProgress) {
            return true;
        }

        window.fastcheckoutKoSuccessRedirectInProgress = true;
        window.fastcheckoutHyvaPayment.afterPlaceOrder();

        return true;
    }

    return function (redirectOnSuccessAction) {
        if (!redirectOnSuccessAction || redirectOnSuccessAction.fastcheckoutRedirectMixinApplied) {
            return redirectOnSuccessAction;
        }

        redirectOnSuccessAction.fastcheckoutRedirectMixinApplied = true;

        redirectOnSuccessAction.execute = wrapper.wrap(
            redirectOnSuccessAction.execute,
            function (originalExecute) {
                if (redirectThroughFastcheckoutBridge()) {
                    return;
                }

                return originalExecute();
            }
        );

        redirectOnSuccessAction.redirectToSuccessPage = wrapper.wrap(
            redirectOnSuccessAction.redirectToSuccessPage,
            function (originalRedirectToSuccessPage) {
                if (redirectThroughFastcheckoutBridge()) {
                    return;
                }

                return originalRedirectToSuccessPage();
            }
        );

        return redirectOnSuccessAction;
    };
});
