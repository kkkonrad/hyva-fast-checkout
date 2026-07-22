/**
 * Magento_Ui max_text_length fails when value is undefined/null:
 *   return !_.isUndefined(value) && value.length <= +params;
 *
 * Empty optional fields (e.g. street line 2) often stay undefined in checkout
 * provider data, which surfaces as the "255 symbols" error. Treat empty the
 * same way min_text_length already does.
 */
define(function () {
    'use strict';

    return function (rules) {
        var originalMax;

        if (!rules || !rules.max_text_length || !rules.max_text_length[0]) {
            return rules;
        }

        originalMax = rules.max_text_length[0];

        rules.max_text_length[0] = function (value, params) {
            if (value === undefined || value === null || value === '') {
                return true;
            }

            if (typeof value === 'string' || Array.isArray(value)) {
                return value.length <= +params;
            }

            return originalMax(value, params);
        };

        return rules;
    };
});
