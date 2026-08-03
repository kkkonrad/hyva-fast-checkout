/**
 * Keep the order-summary item list expanded and use FC product-list markup.
 */
define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            defaults: {
                template: 'Kkkonrad_Fastcheckout/hyva/summary/cart-items'
            },

            /**
             * @returns {Boolean}
             */
            isItemsBlockExpanded: function () {
                if (isFastcheckoutActive()) {
                    return true;
                }

                return this._super();
            },

            /**
             * Only swap template on Fastcheckout; keep Magento stock elsewhere.
             *
             * @returns {Object}
             */
            initialize: function () {
                this._super();

                if (!isFastcheckoutActive()) {
                    this.template = 'Magento_Checkout/summary/cart-items';
                }

                return this;
            }
        });
    };
});
