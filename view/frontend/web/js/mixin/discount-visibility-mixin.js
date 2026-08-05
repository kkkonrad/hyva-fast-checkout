define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            initialize: function () {
                var settings;

                this._super();
                settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings || {};
                if (isFastcheckoutActive() && settings.showDiscount === false) {
                    this.template = 'Kkkonrad_Fastcheckout/empty';
                }

                return this;
            }
        });
    };
});
