define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Customer/js/model/customer',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, customer, shippingSaveCoordinator, isFastcheckoutActive) {
    'use strict';

    function isReady() {
        return (customer.isLoggedIn() || Boolean(quote.guestEmail)) &&
            (quote.isVirtual() || Boolean(quote.shippingMethod()));
    }

    return function (setPaymentInformationExtended) {
        return wrapper.wrap(setPaymentInformationExtended, function (
            originalAction,
            messageContainer,
            paymentData,
            skipBilling
        ) {
            var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

            if (!isFastcheckoutActive() || settings && settings.twoStep) {
                return originalAction(messageContainer, paymentData, skipBilling);
            }
            if (!isReady()) {
                return $.Deferred().reject().promise();
            }

            return $.when(shippingSaveCoordinator.ensureSaved()).then(function () {
                return originalAction(messageContainer, paymentData, skipBilling);
            });
        });
    };
});
