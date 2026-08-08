define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            isItemsBlockExpanded: function () {
                if (isFastcheckoutActive()) {
                    return true;
                }

                return this._super();
            }
        });
    };
});
