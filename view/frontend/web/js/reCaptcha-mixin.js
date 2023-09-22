define(function() {
    'use strict';

    return function(target) {
        return target.extend({
            initCaptcha: function () {
                if (typeof this.settings === 'undefined') {
                    return;
                }
                return this._super();
            },

            getIsInvisibleRecaptcha: function () {
                if (typeof this.settings === 'undefined') {
                    return;
                }
                return this._super();
            }
        });
    }
});