define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Customer/js/model/customer',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, customer, shippingSaveCoordinator, isFastcheckoutActive) {
    'use strict';

    return function (setPaymentInformationExtended) {
        return wrapper.wrap(setPaymentInformationExtended, function (
            originalAction,
            messageContainer,
            paymentData,
            skipBilling
        ) {
            if (!isFastcheckoutActive() || window.checkoutConfig &&
                window.checkoutConfig.fastcheckoutSettings &&
                window.checkoutConfig.fastcheckoutSettings.twoStep) {
                return originalAction(messageContainer, paymentData, skipBilling);
            }
            if ((!customer.isLoggedIn() && !quote.guestEmail) ||
                (!quote.isVirtual() && !quote.shippingMethod())) {
                return $.Deferred().reject().promise();
            }

            return shippingSaveCoordinator.ensureSaved().then(function () {
                return originalAction(messageContainer, paymentData, skipBilling);
            });
        });
    };
});
