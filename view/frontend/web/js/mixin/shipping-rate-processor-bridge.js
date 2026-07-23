define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/model/shipping-rate-registry',
    'Magento_Checkout/js/model/error-processor'
], function (wrapper, isFastcheckoutActive, shippingService, rateRegistry, errorProcessor) {
    'use strict';

    function getAddressKey(address, resolver) {
        if (typeof resolver === 'function') {
            return resolver(address);
        }

        if (address && typeof address.getCacheKey === 'function') {
            return address.getCacheKey();
        }

        if (address && typeof address.getKey === 'function') {
            return address.getKey();
        }

        return null;
    }

    function processError(response) {
        response = response || {};
        if (typeof response.responseText === 'undefined') {
            response.responseText = JSON.stringify({
                message: response.message || 'Could not estimate shipping rates.'
            });
        }
        errorProcessor.process(response);
    }

    function numericEqual(a, b) {
        var na = Number(a),
            nb = Number(b);

        if (isNaN(na) && isNaN(nb)) {
            return true;
        }

        return Math.abs(na - nb) < 0.00001;
    }

    /**
     * Avoid KO list re-renders when Magento re-notifies the same estimated rates.
     */
    function ratesListChanged(currentRates, nextRates) {
        var i,
            cr,
            nr;

        currentRates = Array.isArray(currentRates) ? currentRates : [];
        nextRates = Array.isArray(nextRates) ? nextRates : [];

        if (currentRates.length !== nextRates.length) {
            return true;
        }

        for (i = 0; i < currentRates.length; i++) {
            cr = currentRates[i] || {};
            nr = nextRates[i] || {};
            if (
                String(cr.carrier_code || '') !== String(nr.carrier_code || '') ||
                String(cr.method_code || '') !== String(nr.method_code || '') ||
                !numericEqual(cr.amount, nr.amount) ||
                String(cr.method_title || '') !== String(nr.method_title || '') ||
                String(cr.carrier_title || '') !== String(nr.carrier_title || '')
            ) {
                return true;
            }
        }

        return false;
    }

    return {
        /**
         * Route Magento KO shipping-rate processors through the Fastcheckout bridge.
         *
         * @param {Object} processor
         * @param {Object=} options
         * @returns {Object}
         */
        wrap: function (processor, options) {
            options = options || {};

            if (!processor || typeof processor.getRates !== 'function' || processor.fastcheckoutWrappedRates) {
                return processor;
            }

            processor.getRates = wrapper.wrap(processor.getRates, function (originalGetRates, address) {
                var cacheKey,
                    cache,
                    currentRates;

                if (
                    !isFastcheckoutActive() ||
                    !window.fastcheckoutHyvaShipping ||
                    typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction !== 'function'
                ) {
                    return originalGetRates(address);
                }

                // Method selection must not re-estimate carriers — payment list updates only.
                if (window.fastcheckoutLockShippingRatesList || window.fastcheckoutSelectingShippingMethod) {
                    shippingService.isLoading(false);
                    return;
                }

                cacheKey = getAddressKey(address, options.cacheKeyResolver);
                cache = cacheKey ? rateRegistry.get(cacheKey) : false;
                currentRates = shippingService.getShippingRates()();

                if (cache) {
                    // Cache hit: only replace KO rates when the list actually changed.
                    // Re-setting the same rates on every address re-notify reloads the list UI.
                    if (ratesListChanged(currentRates, cache)) {
                        shippingService.setShippingRates(cache);
                    }
                    shippingService.isLoading(false);
                    return;
                }

                // No registry entry for this address object key, but rates are already
                // on screen (common after Magento builds a new address object on method
                // select). Keep the visible list instead of flashing a reload.
                if (Array.isArray(currentRates) && currentRates.length) {
                    if (cacheKey) {
                        rateRegistry.set(cacheKey, currentRates);
                    }
                    shippingService.isLoading(false);
                    return;
                }

                shippingService.isLoading(true);

                window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(address)
                    .then(function (rates) {
                        rates = Array.isArray(rates) ? rates : [];
                        if (cacheKey) {
                            rateRegistry.set(cacheKey, rates);
                        }
                        if (ratesListChanged(shippingService.getShippingRates()(), rates)) {
                            shippingService.setShippingRates(rates);
                        }
                    })
                    .catch(function (response) {
                        shippingService.setShippingRates([]);
                        processError(response);
                    })
                    .then(function () {
                        shippingService.isLoading(false);
                    });
            });
            processor.fastcheckoutWrappedRates = true;

            return processor;
        }
    };
});
