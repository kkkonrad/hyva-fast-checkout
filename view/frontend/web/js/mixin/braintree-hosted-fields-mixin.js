define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            validateFormFields: function () {
                var isValid = this._super();

                if (isFastcheckoutActive() && !isValid) {
                    this.validateCardType();
                    this.validateExpirationDate();
                    this.validateCvvNumber();
                }

                return isValid;
            }
        });
    };
});
