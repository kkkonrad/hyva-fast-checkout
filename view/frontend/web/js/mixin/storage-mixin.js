define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    var pendingEstimateRequests = Object.create(null);

    /**
     * Fastcheckout uses Magento KO/REST quote pipeline natively.
     * This mixin keeps guest-email injection for place-order payloads —
     * the native REST payload remains the only write path.
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
                '[data-fastcheckout-field="email"]'
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

    function compactObject(value) {
        if (!value || (Array.isArray(value) && !value.length)) {
            return '';
        }
        if (typeof value === 'object' && !Object.keys(value).length) {
            return '';
        }

        return JSON.stringify(value);
    }

    function streetKey(street) {
        if (Array.isArray(street)) {
            return street.map(function (line) {
                return String(line || '').trim();
            });
        }
        if (street && typeof street === 'object') {
            return Object.keys(street).sort().map(function (key) {
                return String(street[key] || '').trim();
            });
        }

        return [String(street || '').trim()];
    }

    function estimateRequestKey(url, data) {
        var payload = parsePayload(data),
            address = payload.address;

        if (payload.addressId !== undefined && payload.addressId !== null) {
            return url + '|address-id|' + String(payload.addressId);
        }
        if (!address || typeof address !== 'object') {
            return '';
        }

        return url + '|' + JSON.stringify([
            String(address.country_id || address.countryId || ''),
            String(address.region_id || address.regionId || ''),
            String(address.region || ''),
            String(address.postcode || ''),
            String(address.city || ''),
            streetKey(address.street),
            compactObject(address.custom_attributes || address.customAttributes),
            compactObject(address.extension_attributes || address.extensionAttributes)
        ]);
    }

    return function (storage) {
        if (!storage) {
            return storage;
        }

        storage.post = wrapper.wrap(storage.post, function (originalPost, url, data, global, contentType, headers, async) {
            var estimateKey,
                request;

            url = normalizeUrl(url);

            if (isFastcheckoutActive()) {
                data = injectGuestEmail(url, data);

                // Magento intentionally makes rate estimation synchronous for
                // persistent quotes. During checkout bootstrap that blocks the
                // main thread, so KO cannot paint the shipping-address form until
                // the REST response returns. Fastcheckout has its own rate-state
                // coordination and can always use the non-blocking request mode.
                if (url && url.indexOf('/estimate-shipping-methods') !== -1) {
                    async = true;
                    estimateKey = estimateRequestKey(url, data);
                    if (estimateKey && pendingEstimateRequests[estimateKey]) {
                        return pendingEstimateRequests[estimateKey];
                    }
                }
            }

            request = originalPost(url, data, global, contentType, headers, async);
            if (estimateKey && request) {
                pendingEstimateRequests[estimateKey] = request;

                if (typeof request.always === 'function') {
                    request.always(function () {
                        if (pendingEstimateRequests[estimateKey] === request) {
                            delete pendingEstimateRequests[estimateKey];
                        }
                    });
                } else {
                    delete pendingEstimateRequests[estimateKey];
                }
            }

            return request;
        });

        return storage;
    };
});
