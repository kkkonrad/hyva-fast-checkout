define([
    'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'
], function (processorBridge) {
    'use strict';

    function getCacheKey(address) {
        return address && typeof address.getKey === 'function' ? address.getKey() : null;
    }

    return function (processor) {
        return processorBridge.wrap(processor, {
            cacheKeyResolver: getCacheKey
        });
    };
});
