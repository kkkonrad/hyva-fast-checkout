define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            validateFormFields: function () {
                if (!isFastcheckoutActive()) {
                    return this._super();
                }

                return [
                    this.validateCardType(),
                    this.validateExpirationDate(),
                    this.validateCvvNumber()
                ].every(function (isValid) {
                    return isValid;
                });
            }
        });
    };
});
