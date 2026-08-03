define([
    'jquery',
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Magento_Customer/js/model/customer',
    'Magento_Customer/js/customer-data',
    'Magento_Checkout/js/checkout-data',
    'Kkkonrad_Fastcheckout/js/hyva/guest-address-snapshot',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, quote, customer, customerData, checkoutData, guestAddressSnapshot, isFastcheckoutActive) {
    'use strict';

    /**
     * Resolve guest email for Magento place-order payload.
     * Core action posts payload.email = quote.guestEmail (plain string property).
     */
    function resolveGuestEmail() {
        var current = '',
            el,
            value = '',
            selectors,
            i;

        if (quote && quote.guestEmail) {
            current = typeof quote.guestEmail === 'function'
                ? quote.guestEmail()
                : quote.guestEmail;
        }
        if (current && String(current).indexOf('@') !== -1) {
            return String(current).trim();
        }

        selectors = [
            '#customer-email',
            '#co-shipping-email',
            '[data-role="email-with-possible-login"] input[type="email"]',
            '[data-role="email-with-possible-login"] input[name="username"]',
            '[data-role="email-with-possible-login"] input[name="email"]',
            '.fastcheckout-native-shipping-address input[name="username"]',
            '.fastcheckout-native-shipping-address input[name="email"]',
            '.fastcheckout-native-shipping-address input[type="email"]',
            'input#customer-email',
            'input[name="username"]',
            'input[name="email"]',
            'input[type="email"]',
            '[data-fastcheckout-field="email"]'
        ];

        for (i = 0; i < selectors.length; i++) {
            el = document.querySelector(selectors[i]);
            if (el && el.value && String(el.value).indexOf('@') !== -1) {
                value = String(el.value).trim();
                break;
            }
        }

        if (!value) {
            try {
                value = window.sessionStorage.getItem('fastcheckout_email') || '';
            } catch (e) {
                value = '';
            }
        }

        if (!value) {
            try {
                if (typeof require === 'function' && require.defined &&
                    require.defined('Magento_Checkout/js/checkout-data')) {
                    var cd = require('Magento_Checkout/js/checkout-data');
                    if (cd) {
                        if (typeof cd.getValidatedEmailValue === 'function') {
                            value = cd.getValidatedEmailValue() || value;
                        }
                        if (!value && typeof cd.getInputFieldEmailValue === 'function') {
                            value = cd.getInputFieldEmailValue() || value;
                        }
                    }
                }
            } catch (cdErr) {
                // ignore
            }
        }

        if (!value && window.checkoutConfig) {
            if (window.checkoutConfig.customerData && window.checkoutConfig.customerData.email) {
                value = window.checkoutConfig.customerData.email;
            } else if (window.checkoutConfig.quoteData && window.checkoutConfig.quoteData.customer_email) {
                value = window.checkoutConfig.quoteData.customer_email;
            }
        }

        return value ? String(value).trim() : '';
    }

    function ensureGuestEmailOnQuote() {
        var email = resolveGuestEmail();

        if (!email || !quote) {
            return email;
        }

        if (typeof quote.guestEmail === 'function') {
            quote.guestEmail(email);
        } else {
            quote.guestEmail = email;
        }

        return email;
    }

    /**
     * After success: snapshot address for next checkout, then clear cart cache only
     * (do not wipe mage-cache-storage entirely — that left only email on next order).
     */
    function afterSuccessfulPlaceOrder() {
        try {
            guestAddressSnapshot.snapshot({
                quote: quote,
                checkoutData: checkoutData
            });
        } catch (snapErr) {
            // non-fatal
        }

        try {
            guestAddressSnapshot.clearCartBrowserCache(customerData);
        } catch (cartErr) {
            // non-fatal
        }
    }

    /**
     * Place order through Magento KO payment action (REST).
     */
    return function (placeOrderAction) {
        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            var commentEl,
                subscribeEl,
                comment,
                subscribe,
                additional,
                email,
                result;

            if (isFastcheckoutActive()) {
                email = ensureGuestEmailOnQuote();

                if (!customer.isLoggedIn() && !email) {
                    try {
                        var emailEl = document.getElementById('customer-email') ||
                            document.querySelector('input[type="email"]');
                        if (emailEl) {
                            emailEl.dispatchEvent(new Event('change', { bubbles: true }));
                            emailEl.dispatchEvent(new Event('blur', { bubbles: true }));
                            email = ensureGuestEmailOnQuote();
                        }
                    } catch (blurErr) {
                        // ignore
                    }
                }

                commentEl = document.querySelector(
                    '#fastcheckout-ko-comment-root [data-fastcheckout-comment], ' +
                    '#fastcheckout-comment, ' +
                    '[name="fastcheckout_comment"], ' +
                    '[data-fastcheckout-comment]'
                );
                subscribeEl = document.querySelector(
                    '[name="fastcheckout_subscribe"], #fastcheckout-subscribe, [data-fastcheckout-subscribe]'
                );
                comment = commentEl && 'value' in commentEl
                    ? String(commentEl.value || '')
                    : String(window.fastcheckoutOrderComment || '');
                subscribe = !!(subscribeEl && (subscribeEl.checked || subscribeEl.value === '1'));

                try {
                    if (email) {
                        window.sessionStorage.setItem('fastcheckout_email', email);
                    }
                } catch (e) {
                    // ignore storage failures
                }

                if (paymentData && typeof paymentData === 'object') {
                    paymentData.extension_attributes = paymentData.extension_attributes || {};
                    delete paymentData.extension_attributes.fastcheckout_comment;
                    delete paymentData.extension_attributes.fastcheckout_subscribe;
                    delete paymentData.extension_attributes.FastcheckoutComment;
                    delete paymentData.extension_attributes.FastcheckoutSubscribe;

                    if (comment) {
                        paymentData.extension_attributes.comment = comment;
                    }
                    paymentData.extension_attributes.subscribe = !!subscribe;

                    additional = paymentData.additional_data;
                    if (!additional || typeof additional !== 'object' || Array.isArray(additional)) {
                        additional = {};
                        paymentData.additional_data = additional;
                    }
                    if (comment) {
                        additional.fastcheckout_comment = comment;
                    }
                    additional.fastcheckout_subscribe = subscribe ? '1' : '0';

                    delete paymentData.fastcheckout_selected_method;
                    delete paymentData.fastcheckout_comment;
                    delete paymentData.fastcheckout_subscribe;
                }
            }

            function submit() {
                result = originalAction(paymentData, messageContainer);

                if (isFastcheckoutActive() && result && typeof result.done === 'function') {
                    result.done(function () {
                        afterSuccessfulPlaceOrder();
                    });
                }

                return result;
            }

            if (isFastcheckoutActive()) {
                document.dispatchEvent(new CustomEvent('fastcheckout:order-submit-started'));
            }

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.prepareForPlaceOrder === 'function'
            ) {
                return $.when(
                    window.fastcheckoutHyvaShipping.prepareForPlaceOrder(messageContainer)
                ).then(submit);
            }

            return submit();
        });
    };
});
