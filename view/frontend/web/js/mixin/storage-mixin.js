define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    /**
     * Fastcheckout uses Magento KO/REST quote pipeline natively.
     * This mixin keeps guest-email injection for place-order payloads —
     * it must not route REST through Magewire (that dual-write caused XHR loops).
     */
    function getEmailFromDomOrQuote() {
        var emailEl,
            selectors = [
                '#customer-email',
                '#co-shipping-email',
                '[data-role="email-with-possible-login"] input[type="email"]',
                '[data-role="email-with-possible-login"] input[name="username"]',
                '[data-role="email-with-possible-login"] input[name="email"]',
                '.fastcheckout-native-shipping-address input[name="username"]',
                '.fastcheckout-native-shipping-address input[name="email"]',
                '.fastcheckout-native-shipping-address input[type="email"]',
                'input[name="username"]',
                'input[name="email"]',
                'input[type="email"]',
                '[data-wire-field="email"]'
            ],
            i,
            value = '',
            quote;

        for (i = 0; i < selectors.length; i++) {
            emailEl = document.querySelector(selectors[i]);
            if (emailEl && emailEl.value && String(emailEl.value).indexOf('@') !== -1) {
                return String(emailEl.value).trim();
            }
        }

        try {
            value = window.sessionStorage.getItem('fastcheckout_email') || '';
            if (value && value.indexOf('@') !== -1) {
                return String(value).trim();
            }
        } catch (e) {
            // ignore
        }

        if (window.checkoutConfig && window.checkoutConfig.customerData && window.checkoutConfig.customerData.email) {
            return window.checkoutConfig.customerData.email;
        }

        if (window.checkoutConfig && window.checkoutConfig.quoteData && window.checkoutConfig.quoteData.customer_email) {
            return window.checkoutConfig.quoteData.customer_email;
        }

        try {
            if (typeof require === 'function' && require.defined && require.defined('Magento_Checkout/js/model/quote')) {
                quote = require('Magento_Checkout/js/model/quote');
                if (quote && quote.guestEmail) {
                    // Magento quote.guestEmail is a plain string, not a KO observable.
                    value = typeof quote.guestEmail === 'function' ? quote.guestEmail() : quote.guestEmail;
                    if (value && String(value).indexOf('@') !== -1) {
                        return String(value).trim();
                    }
                }
            }
        } catch (reqErr) {
            // ignore
        }

        try {
            if (typeof require === 'function' && require.defined &&
                require.defined('Magento_Checkout/js/checkout-data')) {
                var checkoutData = require('Magento_Checkout/js/checkout-data');
                if (checkoutData) {
                    if (typeof checkoutData.getValidatedEmailValue === 'function') {
                        value = checkoutData.getValidatedEmailValue() || '';
                    }
                    if ((!value || value.indexOf('@') === -1) &&
                        typeof checkoutData.getInputFieldEmailValue === 'function') {
                        value = checkoutData.getInputFieldEmailValue() || '';
                    }
                    if (value && String(value).indexOf('@') !== -1) {
                        return String(value).trim();
                    }
                }
            }
        } catch (cdErr) {
            // ignore
        }

        return '';
    }

    function parsePayload(data) {
        if (!data) {
            return {};
        }
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch (e) {
                return {};
            }
        }
        return typeof data === 'object' ? data : {};
    }

    function normalizeUrl(url) {
        if (!url || typeof url !== 'string') {
            return url;
        }
        if (url.indexOf('/rest/') === 0) {
            url = url.substring(1);
        }
        return url.replace(/(https?:\/\/)|(\/)+/g, function (match, protocol) {
            return protocol ? protocol : '/';
        });
    }

    function injectGuestEmail(url, data) {
        var payload,
            email,
            wasString = typeof data === 'string';

        if (!url || url.indexOf('/guest-carts/') === -1) {
            return data;
        }
        if (
            url.indexOf('/payment-information') === -1 &&
            url.indexOf('/set-payment-information') === -1 &&
            !/\/order(?:[?#/]|$)/.test(url)
        ) {
            return data;
        }

        payload = parsePayload(data);
        if (!payload || typeof payload !== 'object') {
            return data;
        }

        email = getEmailFromDomOrQuote();
        if (!email) {
            return data;
        }

        // Always force a non-empty email for guest place/payment REST.
        // Magento WebAPI rejects missing/null email as required fieldName "email".
        if (!payload.email || String(payload.email).indexOf('@') === -1) {
            payload.email = email;
        }
        if (payload.billingAddress && typeof payload.billingAddress === 'object') {
            if (!payload.billingAddress.email || String(payload.billingAddress.email).indexOf('@') === -1) {
                payload.billingAddress.email = email;
            }
        }
        if (payload.billing_address && typeof payload.billing_address === 'object') {
            if (!payload.billing_address.email || String(payload.billing_address.email).indexOf('@') === -1) {
                payload.billing_address.email = email;
            }
        }

        return wasString || typeof data === 'string' ? JSON.stringify(payload) : payload;
    }

    return function (storage) {
        if (!storage) {
            return storage;
        }

        storage.post = wrapper.wrap(storage.post, function (originalPost, url, data, global, contentType, headers, async) {
            url = normalizeUrl(url);

            if (isFastcheckoutActive()) {
                data = injectGuestEmail(url, data);
            }

            return originalPost(url, data, global, contentType, headers, async);
        });

        return storage;
    };
});
