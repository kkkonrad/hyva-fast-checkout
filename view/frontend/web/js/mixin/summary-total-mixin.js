/**
 * Magento summary totals use stepNavigator.isProcessed('shipping') for isFullMode.
 * Fastcheckout has no OPC step navigator — treat totals as full mode whenever
 * quote totals exist so Tax/excl/incl/both rows always render.
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
            isFullMode: function () {
                if (isFastcheckoutActive()) {
                    return !!this.getTotals();
                }

                return this._super();
            }
        });
    };
});
