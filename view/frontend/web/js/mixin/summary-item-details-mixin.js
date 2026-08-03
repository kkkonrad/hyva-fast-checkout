/**
 * Use Fastcheckout product-row details template (name / options / × qty).
 */
define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/hyva/summary/item/details'
            },

            /**
             * @returns {Object}
             */
            initialize: function () {
                this._super();

                if (!isFastcheckoutActive()) {
                    this.template = 'Magento_Checkout/summary/item/details';
                }

                return this;
            }
        });
    };
});
