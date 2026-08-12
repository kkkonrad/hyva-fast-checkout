define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            initialize: function () {
                this._super();
                if (isFastcheckoutActive() && this.isVisible) {
                    this.isVisible(true);
                    if (typeof this.isVisible.subscribe === 'function') {
                        this.isVisible.subscribe(function (visible) {
                            if (!visible) {
                                this.isVisible(true);
                            }
                        }, this);
                    }
                }

                return this;
            }
        });
    };
});
