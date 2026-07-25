define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'Magento_Checkout/js/model/shipping-service'
], function (wrapper, isFastcheckoutActive, shippingService) {
    'use strict';

    /**
     * Fastcheckout shipping rate processors use Magento native getRates (REST
     * estimate-shipping-methods). We only suppress re-estimate while the shopper
     * is selecting a rate (payment remap / totals), so the list does not flash.
     */
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

                // Native Magento rate processor (REST estimate-shipping-methods).
                return originalGetRates(address);
            });
            processor.fastcheckoutWrappedRates = true;

            return processor;
        }
    };
});
