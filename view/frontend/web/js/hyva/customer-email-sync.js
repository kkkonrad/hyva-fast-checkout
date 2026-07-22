define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            persistEmail = typeof deps.persistEmail === 'function' ? deps.persistEmail : function () {};

        function setGuestEmail(email) {
            if (!quote || !email) {
                return;
            }

            if (typeof quote.guestEmail === 'function') {
                if (quote.guestEmail() !== email) {
                    quote.guestEmail(email);
                }
                return;
            }

            quote.guestEmail = email;
        }

        function getEmailFromDomOrConfig() {
            var emailEl = document.getElementById('co-shipping-email') ||
                document.querySelector('input[name="email"]') ||
                document.querySelector('input[type="email"]') ||
                document.querySelector('[data-wire-field="email"]'),
                emailVal = emailEl ? emailEl.value : '';

            if (!emailVal && window.checkoutConfig && window.checkoutConfig.customerData) {
                emailVal = window.checkoutConfig.customerData.email || '';
            }
            if (!emailVal && window.checkoutConfig && window.checkoutConfig.quoteData) {
                emailVal = window.checkoutConfig.quoteData.customer_email || '';
            }

            return emailVal;
        }

        function sync() {
            var emailVal,
                billing;

            if (!quote) {
                return;
            }

            emailVal = getEmailFromDomOrConfig();
            if (emailVal) {
                setGuestEmail(emailVal);
                persistEmail(emailVal);
                billing = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;
                if (billing && typeof billing.getCacheKey === 'function') {
                    billing.email = emailVal;
                }
            }
        }

        function registerInputListener() {
            // Commit on blur/change only — not on every keystroke.
            function isEmailField(target) {
                // Document-level listeners can receive non-Element targets
                // (text nodes, window, synthetic events) that lack getAttribute.
                if (!target || typeof target.getAttribute !== 'function') {
                    return false;
                }

                return (
                    target.name === 'email' ||
                    target.name === 'username' ||
                    target.type === 'email' ||
                    target.id === 'customer-email' ||
                    target.getAttribute('data-wire-field') === 'email'
                );
            }

            document.addEventListener('blur', function (event) {
                if (isEmailField(event.target)) {
                    sync();
                }
            }, true);

            document.addEventListener('change', function (event) {
                if (isEmailField(event.target)) {
                    sync();
                }
            }, true);
        }

        return {
            setGuestEmail: setGuestEmail,
            sync: sync,
            registerInputListener: registerInputListener
        };
    };
});
