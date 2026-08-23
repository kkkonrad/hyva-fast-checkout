define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    function isTwoStep() {
        var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

        return Boolean(settings && settings.twoStep);
    }

    return function (Component) {
        return Component.extend({
            isFullMode: function () {
                if (isFastcheckoutActive() && !isTwoStep()) {
                    return Boolean(this.getTotals());
                }

                return this._super();
            }
        });
    };
});
