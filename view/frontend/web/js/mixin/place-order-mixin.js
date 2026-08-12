define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'uiRegistry'
], function ($, wrapper, shippingSaveCoordinator, isFastcheckoutActive, registry) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            var provider = registry.get('checkoutProvider'),
                extras = provider && provider.get('fastcheckout') || {},
                result,
                active = isFastcheckoutActive();

            if (active && paymentData && typeof paymentData === 'object') {
                paymentData.extension_attributes = paymentData.extension_attributes || {};
                paymentData.extension_attributes.comment = String(extras.comment || '').trim();
                paymentData.extension_attributes.subscribe = Boolean(extras.subscribe);
            }

            if (!active) {
                return originalAction(paymentData, messageContainer);
            }

            document.dispatchEvent(new Event('fastcheckout:order-submit-started'));
            result = $.when(shippingSaveCoordinator.ensureSaved()).then(function () {
                return originalAction(paymentData, messageContainer);
            });
            if (result && typeof result.fail === 'function') {
                result.fail(function () {
                    document.dispatchEvent(new Event('fastcheckout:order-submit-failed'));
                });
            }

            return result;
        });
    };
});
