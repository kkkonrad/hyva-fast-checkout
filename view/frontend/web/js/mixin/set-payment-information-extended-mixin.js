define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Customer/js/model/customer',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active',
    'uiRegistry'
], function ($, wrapper, quote, customer, shippingSaveCoordinator, isFastcheckoutActive, registry) {
    'use strict';

    var shippingMethodWaitMs = 10000;

    function resolvedPromise() {
        return $.Deferred().resolve().promise();
    }

    function waitForObservable(observable, predicate, timeoutMs) {
        var deferred,
            subscription,
            timer,
            settled = false;

        if (!observable || typeof observable.subscribe !== 'function' || predicate(observable())) {
            return resolvedPromise();
        }

        deferred = $.Deferred();

        function finish() {
            if (settled) {
                return;
            }
            settled = true;
            if (subscription) {
                subscription.dispose();
                subscription = null;
            }
            if (timer) {
                window.clearTimeout(timer);
                timer = null;
            }
            deferred.resolve();
        }

        subscription = observable.subscribe(function (value) {
            if (predicate(value)) {
                finish();
            }
        });

        if (timeoutMs) {
            timer = window.setTimeout(finish, timeoutMs);
        }

        return deferred.promise();
    }

    function waitForGuestEmail() {
        var deferred,
            subscriptions = [],
            paths = [
                'checkout.steps.shipping-step.shippingAddress.customer-email',
                'checkout.steps.billing-step.payment.customer-email'
            ];

        if (customer.isLoggedIn() || quote.guestEmail) {
            return resolvedPromise();
        }

        deferred = $.Deferred();

        function resolveWhenValid() {
            if (!quote.guestEmail) {
                return;
            }
            subscriptions.forEach(function (subscription) {
                subscription.dispose();
            });
            subscriptions = [];
            deferred.resolve();
        }

        paths.forEach(function (path) {
            registry.async(path)(function (component) {
                if (component && component.email && typeof component.email.subscribe === 'function') {
                    subscriptions.push(component.email.subscribe(function () {
                        window.setTimeout(resolveWhenValid, 0);
                    }));
                }
                resolveWhenValid();
            });
        });

        return deferred.promise();
    }

    function waitForCheckoutReady() {
        return $.when(waitForGuestEmail()).then(function () {
            if (quote.isVirtual && quote.isVirtual()) {
                return undefined;
            }

            return waitForObservable(quote.shippingMethod, Boolean, shippingMethodWaitMs)
                .then(function () {
                    if (!quote.shippingMethod || !quote.shippingMethod()) {
                        return undefined;
                    }

                    return shippingSaveCoordinator.ensureSaved();
                });
        });
    }

    return function (setPaymentInformationExtended) {
        return wrapper.wrap(setPaymentInformationExtended, function (
            originalAction,
            messageContainer,
            paymentData,
            skipBilling
        ) {
            if (!isFastcheckoutActive()) {
                return originalAction(messageContainer, paymentData, skipBilling);
            }

            return waitForCheckoutReady().then(function () {
                return originalAction(messageContainer, paymentData, skipBilling);
            });
        });
    };
});
