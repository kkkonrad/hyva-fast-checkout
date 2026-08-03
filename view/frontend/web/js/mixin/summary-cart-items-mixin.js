/**
 * Keep the order-summary item list expanded on Fastcheckout (no OPC step state).
 */
define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            /**
             * @returns {Boolean}
             */
            isItemsBlockExpanded: function () {
                if (isFastcheckoutActive()) {
                    return true;
                }

                return this._super();
            }
        });
    };
});
