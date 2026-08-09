define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/set-shipping-information',
    'uiRegistry',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, setShippingInformation, registry, isFastcheckoutActive) {
    'use strict';

    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            var comment = document.getElementById('fastcheckout-comment'),
                subscribe = document.querySelector(
                    '.fastcheckout-ko-payment-root .payment-method._active ' +
                    '[data-fastcheckout-subscribe]'
                ),
                additional,
                shipping;

            if (isFastcheckoutActive() && paymentData && typeof paymentData === 'object') {
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

            if (!isFastcheckoutActive() || (quote.isVirtual && quote.isVirtual())) {
                return originalAction(paymentData, messageContainer);
            }

            shipping = registry.get('checkout.steps.shipping-step.shippingAddress');

            if (!shipping || !shipping.validateShippingInformation()) {
                return $.Deferred().reject().promise();
            }

            return $.when(setShippingInformation()).then(function () {
                return originalAction(paymentData, messageContainer);
            });
        });
    };
});
