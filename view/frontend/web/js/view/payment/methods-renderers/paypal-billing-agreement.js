define(
    [
        'jquery',
        'Magento_Paypal/js/view/payment/method-renderer/paypal-billing-agreement'
    ],
    function ($, Component) {
        'use strict';
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/payment/methods-renderers/paypal_billing_agreement-form'
            },
            optionsRenderCallback: 0,
            decorateSelect: function (uid) {
                clearTimeout(this.optionsRenderCallback);
                this.optionsRenderCallback = setTimeout(function () {
                    var select = $('#' + uid);
                    if (select.length) {
                        select.decorateSelect();
                    }
                }, 0);
            }
        });
    }
);
