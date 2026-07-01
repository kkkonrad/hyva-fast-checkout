define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/shipping-rate-processor-bridge'
], function (wrapper, processorBridge) {
    'use strict';

    return function (shippingRateService) {
        if (!shippingRateService || typeof shippingRateService.registerProcessor !== 'function') {
            return shippingRateService;
        }

        shippingRateService.registerProcessor = wrapper.wrap(
            shippingRateService.registerProcessor,
            function (originalRegisterProcessor, type, processor) {
                return originalRegisterProcessor(type, processorBridge.wrap(processor));
            }
        );

        return shippingRateService;
    };
});
