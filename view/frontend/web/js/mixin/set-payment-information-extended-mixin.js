define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Customer/js/model/customer',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, customer, isFastcheckoutActive) {
    'use strict';

    var pending,
        shippingInformationSaved = false;

    function defer(originalAction, messageContainer, paymentData, skipBilling) {
        pending = pending || {deferred: $.Deferred()};
        pending.action = originalAction;
        pending.args = [messageContainer, paymentData, skipBilling];

        return pending.deferred.promise();
    }

    function flush() {
        var request,
            result;

        if (
            !pending ||
            !quote.guestEmail ||
            (!(quote.isVirtual && quote.isVirtual()) && !shippingInformationSaved)
        ) {
            return;
        }

        request = pending;
        pending = null;

        try {
            result = request.action.apply(null, request.args);
        } catch (error) {
            request.deferred.reject(error);
            return;
        }

        $.when(result).then(function () {
            request.deferred.resolve.apply(request.deferred, arguments);
        }, function () {
            request.deferred.reject.apply(request.deferred, arguments);
        });
    }

    function flushAfterNativeEmailValidation(event) {
        if (event.target && event.target.id === 'customer-email') {
            window.setTimeout(flush, 0);
        }
    }

    document.addEventListener('input', flushAfterNativeEmailValidation);
    document.addEventListener('change', flushAfterNativeEmailValidation);
    document.addEventListener('fastcheckout:shipping-information-saved', function () {
        shippingInformationSaved = true;
        flush();
    });

    return function (setPaymentInformationExtended) {
        return wrapper.wrap(setPaymentInformationExtended, function (
            originalAction,
            messageContainer,
            paymentData,
            skipBilling
        ) {
            var deferred;

            if (!isFastcheckoutActive() || customer.isLoggedIn()) {
                return originalAction(messageContainer, paymentData, skipBilling);
            }

            if (
                !quote.guestEmail ||
                (!(quote.isVirtual && quote.isVirtual()) && !shippingInformationSaved)
            ) {
                return defer(originalAction, messageContainer, paymentData, skipBilling);
            }

            if (pending) {
                deferred = defer(originalAction, messageContainer, paymentData, skipBilling);
                flush();

                return deferred;
            }

            return originalAction(messageContainer, paymentData, skipBilling);
        });
    };
});
