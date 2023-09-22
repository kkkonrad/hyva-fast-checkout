define(
    [
        'jquery',
        'mage/translate',
        'Magento_Paypal/js/view/payment/method-renderer/iframe-methods',
        'Magento_Checkout/js/model/full-screen-loader'
    ],
    function ($, $t, Component, fullScreenLoader) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/methods-renderers/iframe-methods'
            },
            initialize: function () {
                var self = this;
                self._super();
                $(document).on('click', '#iwd_opc_iframe_container .iwd_opc_column_name', function () {
                    $('#iwd_opc_iframe_container .iwd_opc_column_content iframe').appendTo('#' + self.getCode() + '-iframe-container');
                    $('#iwd_opc_iframe_container').hide();
                    $('#checkout').show();
                    fullScreenLoader.stopLoader();
                    self.paymentReady(false);
                    self.isInAction(false);
                    self.iframeIsLoaded = false;
                });
                return this;
            },
            afterPlaceOrder: function () {
                this._super();
                var self = this;
                $('#checkout').hide();
                $('#iwd_opc_iframe_container').show();
                $('#' + self.getCode() + '-iframe-container iframe').appendTo($('#iwd_opc_iframe_container .iwd_opc_column_content'));
                fullScreenLoader.stopLoader();
                document.getElementById(self.getCode() + '-iframe')
                    .contentWindow.location.reload();
            }
        });
    }
);
