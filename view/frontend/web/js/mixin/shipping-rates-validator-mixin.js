/**
 * Magento stock validateDelay is 2000ms (coalesce postcode/city keystrokes).
 * That is unrelated to Fastcheckout races — and makes country/region feel slow.
 *
 * Strategy:
 *  - country / region / region_id: 0ms (discrete selects)
 *  - typed fields (postcode, city, street…): short debounce only, so each digit
 *    of a postcode does not fire its own estimate XHR
 *
 * shipping-view-mixin also cancels any leftover Magento 2000ms timeout when
 * country/region change (handlers already closed over the stock delay).
 */
define([], function () {
    'use strict';

    var FAST_FIELDS = {
        country_id: true,
        region_id: true,
        region: true
    };

    /** Coalesce typing only — not a race workaround. */
    var TYPED_DELAY_MS = 250;
    var FAST_DELAY_MS = 0;

    function fieldIndex(element) {
        if (!element) {
            return '';
        }
        if (element.index != null && element.index !== '') {
            return String(element.index);
        }
        if (element.inputName) {
            return String(element.inputName);
        }
        if (element.dataScope) {
            var parts = String(element.dataScope).split('.');
            return parts[parts.length - 1] || '';
        }
        return '';
    }

    return function (validator) {
        var originalBindHandler;

        if (!validator || typeof validator.bindHandler !== 'function') {
            return validator;
        }

        // Default for handlers that capture validateDelay at bind time.
        validator.validateDelay = TYPED_DELAY_MS;

        originalBindHandler = validator.bindHandler.bind(validator);

        validator.bindHandler = function (element, delay) {
            var index = fieldIndex(element);

            if (FAST_FIELDS[index]) {
                delay = FAST_DELAY_MS;
            } else if (typeof delay === 'undefined' || delay === null || delay >= 1000) {
                delay = TYPED_DELAY_MS;
            }

            return originalBindHandler(element, delay);
        };

        return validator;
    };
});
