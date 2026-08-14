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

    var readyWaitMs = 10000;

    function isTwoStep() {
        var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

        return Boolean(settings && settings.twoStep);
    }

    function resolvedPromise() {
        return $.Deferred().resolve().promise();
    }

    function rejectedPromise() {
        return $.Deferred().reject().promise();
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

        function finish(rejectWait) {
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
            if (rejectWait) {
                deferred.reject();
            } else {
                deferred.resolve();
            }
        }

        subscription = observable.subscribe(function (value) {
            if (predicate(value)) {
                finish(false);
            }
        });

        if (timeoutMs) {
            timer = window.setTimeout(function () {
                finish(true);
            }, timeoutMs);
        }

        return deferred.promise();
    }

    function waitForGuestEmail() {
        var deferred,
            subscriptions = [],
            timer,
            settled = false,
            paths = [
                'checkout.steps.shipping-step.shippingAddress.customer-email',
                'checkout.steps.billing-step.payment.customer-email'
            ];

        if (customer.isLoggedIn() || quote.guestEmail) {
            return resolvedPromise();
        }

        deferred = $.Deferred();

        function finish(rejectWait) {
            if (settled) {
                return;
            }
            settled = true;
            subscriptions.forEach(function (subscription) {
                subscription.dispose();
            });
            subscriptions = [];
            if (timer) {
                window.clearTimeout(timer);
                timer = null;
            }
            if (rejectWait) {
                deferred.reject();
            } else {
                deferred.resolve();
            }
        }

        function resolveWhenValid() {
            if (quote.guestEmail) {
                finish(false);
            }
        }

        paths.forEach(function (path) {
            registry.async(path)(function (component) {
                if (settled) {
                    return;
                }
                if (component && component.email && typeof component.email.subscribe === 'function') {
                    subscriptions.push(component.email.subscribe(function () {
                        window.setTimeout(resolveWhenValid, 0);
                    }));
                }
                resolveWhenValid();
            });
        });

        timer = window.setTimeout(function () {
            finish(true);
        }, readyWaitMs);

        return deferred.promise();
    }

    function waitForCheckoutReady() {
        return $.when(waitForGuestEmail()).then(function () {
            if (quote.isVirtual && quote.isVirtual()) {
                return undefined;
            }

            return waitForObservable(quote.shippingMethod, Boolean, readyWaitMs)
                .then(function () {
                    if (!quote.shippingMethod || !quote.shippingMethod()) {
                        return rejectedPromise();
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
            if (!isFastcheckoutActive() || isTwoStep()) {
                return originalAction(messageContainer, paymentData, skipBilling);
            }

            return waitForCheckoutReady().then(function () {
                return originalAction(messageContainer, paymentData, skipBilling);
            });
        });
    };
});
