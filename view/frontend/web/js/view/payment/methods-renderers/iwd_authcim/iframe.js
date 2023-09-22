define(
    [
        'jquery',
        'IWD_AuthCIM/js/view/payment/method-renderer/iframe'
    ],
    function ($, Component) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/iwd_authcim/iframe',
                isCurrentlySecure: window.checkoutConfig.iwdOpcSettings.isCurrentlySecure
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