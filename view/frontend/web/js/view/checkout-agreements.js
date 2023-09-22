define(
    [
        'ko',
        'jquery',
        'uiComponent'
    ],
    function (ko, $, Component) {
        'use strict';
        var checkoutConfig = window.checkoutConfig,
            agreementManualMode = "1",
            agreementsConfig = checkoutConfig ? checkoutConfig.checkoutAgreements : {};

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/checkout-agreements'
            },
            isVisible: agreementsConfig.isEnabled,
            agreements: agreementsConfig.agreements,

            appendScrollbar: function (element) {
                $(element).scrollbar();
            },

            /**
             * Checks if agreement required
             *
             * @param element
             */
            isAgreementRequired: function (element) {
                return element.mode === agreementManualMode;
            }
        });
    }
);
