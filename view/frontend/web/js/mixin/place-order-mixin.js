define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, shippingSaveCoordinator, isFastcheckoutActive) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            var comment = document.getElementById('fastcheckout-comment'),
                subscribe = document.querySelector(
                    '.fastcheckout-ko-payment-root .payment-method._active ' +
                    '[data-fastcheckout-subscribe]'
                ),
                additional,
                result,
                active = isFastcheckoutActive();

            if (active && paymentData && typeof paymentData === 'object') {
                paymentData.extension_attributes = paymentData.extension_attributes || {};
                paymentData.extension_attributes.comment = comment ? String(comment.value || '').trim() : '';
                paymentData.extension_attributes.subscribe = !!(subscribe && subscribe.checked);

                additional = paymentData.additional_data;
                if (!additional || typeof additional !== 'object' || Array.isArray(additional)) {
                    additional = paymentData.additional_data = {};
                }
                additional.fastcheckout_comment = paymentData.extension_attributes.comment;
                additional.fastcheckout_subscribe = paymentData.extension_attributes.subscribe ? '1' : '0';
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
