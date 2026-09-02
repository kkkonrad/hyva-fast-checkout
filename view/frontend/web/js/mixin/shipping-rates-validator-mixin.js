define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    var inputDelay = 1500;

    return function (validator) {
        var bindHandler = validator.bindHandler;

        if (!isFastcheckoutActive()) {
            return validator;
        }

        validator.bindHandler = function (element, delay) {
            var index = element && element.index;

            if (index === 'country_id' || index === 'region_id') {
                delay = 0;
            } else if (index === 'postcode' || index === 'region' || index === 'region_id_input') {
                delay = inputDelay;
            }

            return bindHandler.call(this, element, delay);
        };

        return validator;
    };
});
