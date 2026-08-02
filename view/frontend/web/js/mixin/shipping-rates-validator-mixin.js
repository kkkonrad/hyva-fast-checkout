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
define([
    'Magento_Checkout/js/model/quote'
], function (quote) {
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

    function matchesCurrentQuote(element) {
        var index = fieldIndex(element),
            aliases = {
                country_id: ['countryId', 'country_id'],
                region_id: ['regionId', 'region_id'],
                region_id_input: ['region'],
                region: ['region'],
                postcode: ['postcode'],
                city: ['city']
            }[index],
            address,
            value,
            i;

        if (!aliases || !quote || typeof quote.shippingAddress !== 'function') {
            return false;
        }

        address = quote.shippingAddress();
        if (!address || !element || typeof element.value !== 'function') {
            return false;
        }

        value = String(element.value() == null ? '' : element.value()).trim();
        // region_id_input is the hidden free-text alternative when the selected
        // country uses a directory region select. Clearing it changes no address.
        if (
            index === 'region_id_input' &&
            !value &&
            String(address.regionId || address.region_id || '').trim()
        ) {
            return true;
        }
        for (i = 0; i < aliases.length; i++) {
            if (String(address[aliases[i]] == null ? '' : address[aliases[i]]).trim() === value) {
                return true;
            }
        }

        return false;
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
            var index = fieldIndex(element),
                originalOn;

            // Fastcheckout initializes native carrier validators after the shipping
            // component. Core does not deduplicate initFields(), so the same field
            // otherwise gets multiple value subscriptions and loader cycles.
            if (element && element.fastcheckoutRatesValidatorBound) {
                return;
            }
            if (element) {
                element.fastcheckoutRatesValidatorBound = true;
            }

            if (FAST_FIELDS[index]) {
                delay = FAST_DELAY_MS;
            } else if (typeof delay === 'undefined' || delay === null || delay >= 1000) {
                delay = TYPED_DELAY_MS;
            }

            originalOn = element && element.on;
            if (typeof originalOn !== 'function') {
                return originalBindHandler(element, delay);
            }

            // Provider hydration can emit value changes for the address already on
            // quote. Ignore those no-op writes; selecting/typing a new destination
            // still differs from quote and follows Magento's native validation path.
            element.on = function (eventName, callback) {
                if (eventName !== 'value' || typeof callback !== 'function') {
                    return originalOn.apply(this, arguments);
                }

                return originalOn.call(this, eventName, function () {
                    if (matchesCurrentQuote(element)) {
                        return;
                    }

                    return callback.apply(this, arguments);
                });
            };

            try {
                return originalBindHandler(element, delay);
            } finally {
                element.on = originalOn;
            }
        };

        return validator;
    };
});
