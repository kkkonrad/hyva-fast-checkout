define([
    'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'
], function (processorBridge) {
    'use strict';

    function getCacheKey(address) {
        return address && typeof address.getCacheKey === 'function' ? address.getCacheKey() : null;
    }

    return function (processor) {
        return processorBridge.wrap(processor, {
            cacheKeyResolver: getCacheKey
        });
    };
});
