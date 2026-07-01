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
                    cache;

                if (
                    !isFastcheckoutActive() ||
                    !window.fastcheckoutHyvaShipping ||
                    typeof window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction !== 'function'
                ) {
                    return originalGetRates(address);
                }

                cacheKey = getAddressKey(address, options.cacheKeyResolver);
                cache = cacheKey ? rateRegistry.get(cacheKey) : false;

                if (!window.fastcheckoutInitialLoad) {
                    shippingService.isLoading(true);
                }

                if (cache) {
                    shippingService.setShippingRates(cache);
                    if (!window.fastcheckoutInitialLoad) {
                        shippingService.isLoading(false);
                    }
                    return;
                }

                window.fastcheckoutHyvaShipping.onEstimateShippingRatesAction(address)
                    .then(function (rates) {
                        rates = Array.isArray(rates) ? rates : [];
                        if (cacheKey) {
                            rateRegistry.set(cacheKey, rates);
                        }
                        shippingService.setShippingRates(rates);
                    })
                    .catch(function (response) {
                        shippingService.setShippingRates([]);
                        processError(response);
                    })
                    .then(function () {
                        if (!window.fastcheckoutInitialLoad) {
                            shippingService.isLoading(false);
                        }
                    });
            });
            processor.fastcheckoutWrappedRates = true;

            return processor;
        }
    };
});
