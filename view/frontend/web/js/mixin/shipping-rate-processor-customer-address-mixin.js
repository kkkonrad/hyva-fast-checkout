define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/model/shipping-rate-registry',
    'Magento_Checkout/js/model/error-processor'
], function (wrapper, isFastcheckoutActive, shippingService, rateRegistry, errorProcessor) {
    'use strict';

    function getCacheKey(address) {
        return address && typeof address.getKey === 'function' ? address.getKey() : null;
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

    return function (processor) {
        if (!processor || typeof processor.getRates !== 'function') {
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

            cacheKey = getCacheKey(address);
            cache = cacheKey ? rateRegistry.get(cacheKey) : false;

            shippingService.isLoading(true);

            if (cache) {
                shippingService.setShippingRates(cache);
                shippingService.isLoading(false);
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
                    shippingService.isLoading(false);
                });
        });

        return processor;
    };
});
