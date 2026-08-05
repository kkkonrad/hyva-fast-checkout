define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            isFullMode: function () {
                if (isFastcheckoutActive()) {
                    return Boolean(this.getTotals());
                }

                return this._super();
            }
        });
    };
});
