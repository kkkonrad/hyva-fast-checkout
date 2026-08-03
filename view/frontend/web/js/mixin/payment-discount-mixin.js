/**
 * Fastcheckout layout for Magento_SalesRule payment discount (coupon form).
 */
define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/hyva/payment/discount'
            },

            /**
             * @returns {Object}
             */
            initialize: function () {
                this._super();

                if (!isFastcheckoutActive()) {
                    this.template = 'Magento_SalesRule/payment/discount';
                }

                return this;
            }
        });
    };
});
