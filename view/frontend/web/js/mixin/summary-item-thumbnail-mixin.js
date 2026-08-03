/**
 * Fixed-size product thumbnail for Fastcheckout summary (matches SSR 56×56).
 */
define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/hyva/summary/item/thumbnail'
            },

            /**
             * @returns {Object}
             */
            initialize: function () {
                this._super();

                if (!isFastcheckoutActive()) {
                    this.template = 'Magento_Checkout/summary/item/details/thumbnail';
                }

                return this;
            }
        });
    };
});
