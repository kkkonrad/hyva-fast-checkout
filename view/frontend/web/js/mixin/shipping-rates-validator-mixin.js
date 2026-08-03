/**
 * Magento stock bindHandler sets shippingService.isLoading(true) on every keystroke
 * (list "reloads"/spinner immediately), then debounces validateFields (stock 2000ms).
 *
 * Fastcheckout:
 *  - country_id: 0ms (estimate after selection)
 *  - postcode + region_id (+ other typed fields): 1500ms debounce
 *  - isLoading only when the debounced estimate actually runs (not per key)
 *
 * We wrap bindHandler so Magento still registers observed elements, but replace
 * the value callback with one that defers both loader and validateFields.
 */
define([
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/shipping-service'
], function (quote, shippingService) {
    'use strict';

    var FAST_FIELDS = {
        country_id: true
    };

    var DEBOUNCE_MS = 1500;
    var FAST_DELAY_MS = 0;
    var postcodeElementName = 'postcode';

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

    function delayForField(index) {
        if (FAST_FIELDS[index]) {
            return FAST_DELAY_MS;
        }
        return DEBOUNCE_MS;
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

        validator.validateDelay = DEBOUNCE_MS;
        originalBindHandler = validator.bindHandler.bind(validator);

        validator.bindHandler = function (element, delay) {
            var self = validator,
                index = fieldIndex(element),
                useDelay = delayForField(index),
                originalOn;

            // Core does not dedupe initFields — multiple carrier validators re-bind.
            if (element && element.fastcheckoutRatesValidatorBound) {
                return;
            }
            if (element) {
                element.fastcheckoutRatesValidatorBound = true;
            }

            // Honour explicit delay only for country (callers may pass 0).
            if (FAST_FIELDS[index] && typeof delay === 'number' && delay === 0) {
                useDelay = 0;
            }

            // Groups: Magento recurses into children — keep stock path.
            if (element && element.component && String(element.component).indexOf('/group') !== -1) {
                return originalBindHandler(element, useDelay);
            }

            if (!element || typeof element.on !== 'function') {
                return originalBindHandler(element, useDelay);
            }

            originalOn = element.on.bind(element);

            // Hijack only while Magento bindHandler registers element.on('value', …).
            element.on = function (eventName, callback) {
                if (eventName !== 'value' || typeof callback !== 'function') {
                    return originalOn.apply(this, arguments);
                }

                return originalOn.call(this, eventName, function () {
                    if (matchesCurrentQuote(element)) {
                        return;
                    }

                    // Zip format warning — same debounce as rates.
                    clearTimeout(self.validateZipCodeTimeout);
                    self.validateZipCodeTimeout = setTimeout(function () {
                        if (typeof self.postcodeValidation !== 'function') {
                            return;
                        }
                        if (index === postcodeElementName) {
                            self.postcodeValidation(element);
                        }
                    }, useDelay);

                    // Do NOT call shippingService.isLoading(true) here — that is what
                    // made the shipping list flash "reload" on every keystroke.
                    clearTimeout(self.validateAddressTimeout);
                    self.validateAddressTimeout = setTimeout(function () {
                        try {
                            if (shippingService && typeof shippingService.isLoading === 'function') {
                                shippingService.isLoading(true);
                            }
                        } catch (eLoad) {
                            // non-fatal
                        }
                        if (typeof self.validateFields === 'function') {
                            self.validateFields();
                        }
                    }, useDelay);
                });
            };

            try {
                // Magento registers observedElements + our replaced value handler.
                return originalBindHandler(element, useDelay);
            } finally {
                element.on = originalOn;
            }
        };

        return validator;
    };
});
