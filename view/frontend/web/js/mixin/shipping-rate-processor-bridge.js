define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/model/shipping-rate-registry'
], function (wrapper, isFastcheckoutActive, shippingService, rateRegistry) {
    'use strict';

    /**
     * Magento new-customer-address getCacheKey() is unique per object instance, so
     * rateRegistry never hits and every field debounce / dual selectShippingAddress
     * re-POSTs estimate-shipping-methods for the same destination.
     *
     * For rate lookup only we temporarily use a destination-based key (restored after
     * the request settles) so concurrent/identical estimates collapse.
     */
    var pendingByDestination = {};

    function streetKey(street) {
        if (Array.isArray(street)) {
            return street.map(function (line) {
                return String(line || '').trim();
            }).join('|');
        }
        if (street && typeof street === 'object') {
            return [street[0] || street['0'] || '', street[1] || street['1'] || ''].join('|');
        }

        return street ? String(street) : '';
    }

    function destinationKey(address) {
        if (!address) {
            return '';
        }

        return [
            String(address.countryId || address.country_id || ''),
            String(address.regionId || address.region_id || ''),
            String(address.region || ''),
            String(address.postcode || ''),
            String(address.city || ''),
            streetKey(address.street)
        ].join('~');
    }

    function registryKey(address) {
        return 'fc-dest-rate:' + destinationKey(address);
    }

    function finishPending(dest, address, originalGetCacheKey) {
        pendingByDestination[dest] = false;
        if (address && originalGetCacheKey) {
            address.getCacheKey = originalGetCacheKey;
        }
    }

    return {
        /**
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
                var dest,
                    regKey,
                    cached,
                    originalGetCacheKey = null,
                    loadingSub = null,
                    settled = false;

                if (!isFastcheckoutActive()) {
                    return originalGetRates(address);
                }

                // Method selection must not re-estimate carriers — payment/totals only.
                if (window.fastcheckoutLockShippingRatesList || window.fastcheckoutSelectingShippingMethod) {
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(false);
                    }
                    return;
                }

                dest = destinationKey(address);
                if (!dest) {
                    return originalGetRates(address);
                }

                regKey = registryKey(address);

                // Identical destination already in flight — first call will set rates.
                if (pendingByDestination[dest]) {
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(true);
                    }
                    return;
                }

                cached = rateRegistry && typeof rateRegistry.get === 'function'
                    ? rateRegistry.get(regKey)
                    : false;

                if (cached) {
                    if (shippingService && typeof shippingService.setShippingRates === 'function') {
                        shippingService.setShippingRates(cached);
                    }
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(false);
                    }
                    return;
                }

                if (address && typeof address.getCacheKey === 'function') {
                    originalGetCacheKey = address.getCacheKey.bind(address);
                    address.getCacheKey = function () {
                        return regKey;
                    };
                }

                pendingByDestination[dest] = true;

                function settle() {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    if (loadingSub && typeof loadingSub.dispose === 'function') {
                        loadingSub.dispose();
                    }
                    finishPending(dest, address, originalGetCacheKey);
                }

                // When Magento finishes (success or fail) isLoading goes false.
                if (shippingService && shippingService.isLoading && typeof shippingService.isLoading.subscribe === 'function') {
                    loadingSub = shippingService.isLoading.subscribe(function (loading) {
                        if (!loading) {
                            settle();
                        }
                    });
                }

                // Safety net if isLoading never flips.
                window.setTimeout(settle, 8000);

                return originalGetRates(address);
            });
            processor.fastcheckoutWrappedRates = true;

            return processor;
        }
    };
});
