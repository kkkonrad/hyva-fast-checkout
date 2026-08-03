define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, isFastcheckoutActive) {
    'use strict';

    /**
     * Magento_SalesRule wraps select-payment-method and POSTs set-payment-information
     * on every call. Fastcheckout (and multiple payment renderers) often re-select the
     * same method many times in one click — coalesce identical / in-flight requests.
     *
     * Also sequence after set-shipping-information: PaymentMethodManagement requires
     * a non-null shipping country_id on the *server* quote and throws
     * "The shipping address is missing" / "Brak adresu wysyłki" when payment is
     * selected too early. Client-side country seed alone is not enough — the XHR
     * must not leave the browser until the server has the address (or we skip the
     * POST entirely so Magento errorProcessor never surfaces the message).
     *
     * We intentionally do NOT require set-shipping-information here (avoid RequireJS
     * load-order coupling with the shipping pipeline). shipping-method-sync publishes
     * fastcheckoutServerShippingCountryReady + flushes pending payment after success.
     */
    var lastMethodKey = '',
        lastAt = 0,
        lastResult = null,
        inFlightKey = '',
        inFlightPromise = null,
        // Identical method within this window reuses the last successful result.
        DEDUPE_MS = 2000,
        pendingPaymentFlush = null,
        boundOriginalAction = null;

    function methodKey(paymentData, skipBilling) {
        var method = paymentData && paymentData.method ? String(paymentData.method) : '';

        return method + '|' + (skipBilling ? '1' : '0');
    }

    function getShippingCountryId() {
        var shipping;

        if (!quote || typeof quote.shippingAddress !== 'function') {
            return '';
        }
        shipping = quote.shippingAddress();
        if (!shipping) {
            return '';
        }

        return String(shipping.countryId || shipping.country_id || '').trim();
    }

    function isServerShippingCountryReady() {
        return !!window.fastcheckoutServerShippingCountryReady;
    }

    function markServerShippingCountryReady(ready) {
        window.fastcheckoutServerShippingCountryReady = !!ready;
        if (ready) {
            window.fastcheckoutShippingInformationSettledAt = Date.now();
        }
    }

    function waitForShippingInformation() {
        var pending = window.fastcheckoutShippingInformationPromise;

        if (!pending) {
            return $.Deferred().resolve().promise();
        }

        return $.when(pending).then(
            function (result) {
                return result;
            },
            function () {
                // Shipping-information may fail for incomplete forms; still continue
                // so we can skip payment-info cleanly when the server is not ready.
                return true;
            }
        );
    }

    function seedClientShippingCountry() {
        var bridge = window.fastcheckoutHyvaPayment,
            shipping = quote && typeof quote.shippingAddress === 'function'
                ? quote.shippingAddress()
                : null,
            country;

        if (getShippingCountryId()) {
            return true;
        }

        if (
            bridge &&
            typeof bridge.ensureShippingCountryOnQuote === 'function'
        ) {
            try {
                bridge.ensureShippingCountryOnQuote();
            } catch (e) {
                // non-fatal
            }
        }

        country = getShippingCountryId();
        if (country) {
            return true;
        }

        // Last resort: default destination / checkoutConfig.
        country = String(
            (window.fastcheckoutDefaultDestination &&
                window.fastcheckoutDefaultDestination.countryId) ||
            (window.checkoutConfig && window.checkoutConfig.defaultCountryId) ||
            ''
        ).trim();

        if (
            country &&
            shipping &&
            typeof shipping === 'object'
        ) {
            try {
                shipping.countryId = country;
                shipping.country_id = country;
                if (typeof quote.shippingAddress === 'function') {
                    // re-trigger KO subscribers without full re-select when possible
                    quote.shippingAddress(shipping);
                }
            } catch (e2) {
                // ignore
            }
        }

        return !!getShippingCountryId();
    }

    /**
     * True when it is safe to POST set-payment-information for a non-virtual quote.
     * Prefers the flag set by a successful set-shipping-information; falls back to
     * waiting for an in-flight push. Does not invent a server address client-side.
     *
     * @returns {jQuery.Promise<boolean>}
     */
    function ensureServerShippingAddress() {
        if (quote.isVirtual && quote.isVirtual()) {
            return $.Deferred().resolve(true).promise();
        }

        if (isServerShippingCountryReady()) {
            return $.Deferred().resolve(true).promise();
        }

        return waitForShippingInformation().then(function () {
            if (isServerShippingCountryReady()) {
                return true;
            }

            // Client seed only helps billing/UI — Magento PaymentMethodManagement
            // reads the repository quote. Without a successful set-shipping-
            // information we must not POST set-payment-information.
            seedClientShippingCountry();
            return false;
        });
    }

    function isMissingShippingAddressError(response) {
        var message = '';

        if (!response) {
            return false;
        }
        if (response.message) {
            message = String(response.message);
        } else if (response.responseJSON && response.responseJSON.message) {
            message = String(response.responseJSON.message);
        } else if (typeof response === 'string') {
            message = response;
        }

        return /shipping address is missing|Brak adresu wysyłki/i.test(message);
    }

    /**
     * Remember a set-payment call that was deferred until the server shipping
     * address is ready. select-payment-method is a no-op when the method is
     * already on the quote, so SalesRule will not re-POST automatically.
     */
    function rememberPendingPayment(messageContainer, paymentData, skipBilling) {
        pendingPaymentFlush = {
            messageContainer: messageContainer,
            paymentData: paymentData,
            skipBilling: skipBilling
        };
    }

    function flushPendingPaymentInformation() {
        var pending = pendingPaymentFlush,
            action = boundOriginalAction,
            paymentData,
            key;

        if (!pending || !action) {
            return $.Deferred().resolve(null).promise();
        }

        if (!(quote.isVirtual && quote.isVirtual()) && !isServerShippingCountryReady()) {
            return $.Deferred().resolve(null).promise();
        }

        pendingPaymentFlush = null;
        paymentData = pending.paymentData || {};
        key = methodKey(paymentData, pending.skipBilling);

        // Bypass short-window dedupe so the deferred POST actually runs.
        if (key && key === lastMethodKey) {
            lastMethodKey = '';
            lastResult = null;
        }

        return action(pending.messageContainer, paymentData, pending.skipBilling);
    }

    // shipping-method-sync calls this after a successful set-shipping-information.
    window.fastcheckoutFlushPendingPaymentInformation = flushPendingPaymentInformation;

    return function (setPaymentInformationExtendedAction) {
        return wrapper.wrap(
            setPaymentInformationExtendedAction,
            function (originalAction, messageContainer, paymentData, skipBilling) {
                var key,
                    now,
                    deferred;

                boundOriginalAction = originalAction;

                if (!isFastcheckoutActive()) {
                    return originalAction(messageContainer, paymentData, skipBilling);
                }

                key = methodKey(paymentData, skipBilling);
                now = Date.now();

                // Same method already in flight — share one XHR.
                if (key && key === inFlightKey && inFlightPromise) {
                    return inFlightPromise;
                }

                // Same method just completed successfully — skip a new round-trip.
                if (
                    key &&
                    key === lastMethodKey &&
                    lastResult &&
                    (now - lastAt) < DEDUPE_MS
                ) {
                    deferred = $.Deferred();
                    deferred.resolve(lastResult);
                    return deferred.promise();
                }

                inFlightKey = key;
                inFlightPromise = ensureServerShippingAddress().then(function (serverReady) {
                    // Virtual quotes do not need shipping country.
                    if (!(quote.isVirtual && quote.isVirtual())) {
                        if (!serverReady) {
                            // Avoid server InvalidTransitionException noise when the
                            // shopper has not finished the address form or shipping-
                            // information has not landed. Quote payment method is
                            // already set by select-payment-method; flush after a
                            // successful set-shipping-information.
                            rememberPendingPayment(messageContainer, paymentData, skipBilling);
                            return null;
                        }
                        // Belt-and-suspenders: keep KO country populated for billing.
                        seedClientShippingCountry();
                    }

                    pendingPaymentFlush = null;

                    return $.when(
                        originalAction(messageContainer, paymentData, skipBilling)
                    ).then(null, function (response) {
                        // Recovery if Magento still says shipping is missing
                        // (stale ready flag). Prefer skip over rethrow so the UI
                        // does not keep a hard error when a later flush can succeed.
                        if (!isMissingShippingAddressError(response)) {
                            return $.Deferred().reject(response).promise();
                        }

                        markServerShippingCountryReady(false);
                        rememberPendingPayment(messageContainer, paymentData, skipBilling);

                        return waitForShippingInformation().then(function () {
                            if (
                                !(quote.isVirtual && quote.isVirtual()) &&
                                !isServerShippingCountryReady()
                            ) {
                                return null;
                            }

                            pendingPaymentFlush = null;

                            return originalAction(messageContainer, paymentData, skipBilling);
                        });
                    });
                }).done(function (result) {
                    if (result !== null && typeof result !== 'undefined') {
                        lastMethodKey = key;
                        lastAt = Date.now();
                        lastResult = result;
                    }
                }).always(function () {
                    if (inFlightKey === key) {
                        inFlightKey = '';
                        inFlightPromise = null;
                    }
                });

                return inFlightPromise;
            }
        );
    };
});
