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
            document.addEventListener('input', function (event) {
                if (
                    event.target &&
                    (
                        event.target.name === 'email' ||
                        event.target.type === 'email' ||
                        event.target.getAttribute('data-wire-field') === 'email'
                    )
                ) {
                    sync();
                }
            });
        }

        return {
            setGuestEmail: setGuestEmail,
            sync: sync,
            registerInputListener: registerInputListener
        };
    };
});
