/**
 * Force guest checkout email to request address/contact autofill, not password credentials.
 * Magento core markup (form-login + name=username + password) trains browsers to offer logins.
 */
define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, isFastcheckoutActive) {
    'use strict';

    function hardenEmailInput(input) {
        if (!input || !input.setAttribute) {
            return;
        }

        input.setAttribute('type', 'email');
        input.setAttribute('name', 'email');
        input.setAttribute('autocomplete', 'email');
        input.setAttribute('inputmode', 'email');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('spellcheck', 'false');

        // Detach from any residual login form wrapper browsers still treat as credentials.
        var form = input.form || input.closest('form');
        if (form && form.classList && form.classList.contains('form-login')) {
            form.classList.remove('form-login');
            form.classList.add('form-email');
        }
    }

    function removeHiddenPasswordFields() {
        // If a password field is still in the DOM while login UI is hidden, browsers keep
        // offering credentials for the nearby email field.
        document.querySelectorAll(
            '#customer-email-fieldset input[type="password"], ' +
            'form.form-login input[type="password"]#customer-password'
        ).forEach(function (passwordInput) {
            var loginForm = passwordInput.closest('form.form-login');
            var visible = passwordInput.offsetParent !== null ||
                (passwordInput.getClientRects && passwordInput.getClientRects().length > 0);

            // Only strip residual/hidden password nodes, never an intentionally shown login form.
            if (!visible && (!loginForm || loginForm.querySelector('.actions-toolbar') === null)) {
                passwordInput.parentNode && passwordInput.parentNode.removeChild(passwordInput);
            }
        });
    }

    return function (EmailComponent) {
        return EmailComponent.extend({
            /**
             * @returns {Object}
             */
            initialize: function () {
                this._super();

                if (isFastcheckoutActive()) {
                    this.fastcheckoutRestorePersistedEmail();
                    // After KO paint + after any delayed Magento re-render of email.
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 0);
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 400);
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 1200);
                    // Late restore: session/last-guest snapshot may apply after component init.
                    setTimeout(this.fastcheckoutRestorePersistedEmail.bind(this), 300);
                    setTimeout(this.fastcheckoutRestorePersistedEmail.bind(this), 1200);
                }

                return this;
            },

            /**
             * Magento wires afterRender -> emailHasChanged; wrap to also harden attributes.
             */
            emailHasChanged: function () {
                if (isFastcheckoutActive()) {
                    this.fastcheckoutHardenEmailAutofill();
                }

                return this._super();
            },

            /**
             * Magento core targets form-login + input[name=username]. Fastcheckout guest
             * email uses name=email in form-email — avoid jQuery-validator edge cases on
             * that markup and use a small native/format check instead.
             *
             * @param {Boolean} focused
             * @returns {Boolean}
             */
            validateEmail: function (focused) {
                var email,
                    input,
                    valid;

                if (!isFastcheckoutActive()) {
                    return this._super(focused);
                }

                email = typeof this.email === 'function' ? this.email() : '';
                input = document.getElementById('customer-email') ||
                    document.querySelector(
                        '[data-role="email-with-possible-login"] input[name="email"], ' +
                        '[data-role="email-with-possible-login"] input[name="username"]'
                    );

                if (focused === false && email) {
                    valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());

                    if (input) {
                        if (valid) {
                            input.removeAttribute('aria-invalid');
                            input.removeAttribute('aria-describedby');
                        } else {
                            input.setAttribute('aria-invalid', 'true');
                        }
                    }

                    return valid;
                }

                // While typing / empty: do not mark invalid; place-order paths re-check.
                return true;
            },

            fastcheckoutHardenEmailAutofill: function () {
                var selector = this.emailInputId || '#customer-email',
                    input = document.querySelector(selector) || document.getElementById('customer-email');

                hardenEmailInput(input);
                removeHiddenPasswordFields();
            },

            /**
             * Rehydrate guest email after order-success cleanup wiped in-memory state.
             * Prefer Magento checkout-data, then Fastcheckout session / last-guest snapshot.
             */
            fastcheckoutRestorePersistedEmail: function () {
                var self = this,
                    current = typeof this.email === 'function' ? String(this.email() || '').trim() : '',
                    restored = '';

                if (current) {
                    this.fastcheckoutHardenEmailAutofill();
                    return;
                }

                try {
                    if (typeof window.require === 'function') {
                        window.require(['Magento_Checkout/js/checkout-data'], function (checkoutData) {
                            var value = '';

                            try {
                                if (checkoutData && typeof checkoutData.getInputFieldEmailValue === 'function') {
                                    value = checkoutData.getInputFieldEmailValue() || '';
                                }
                                if (!value && checkoutData && typeof checkoutData.getValidatedEmailValue === 'function') {
                                    value = checkoutData.getValidatedEmailValue() || '';
                                }
                            } catch (e) {}

                            if (!value) {
                                try {
                                    value = window.sessionStorage.getItem('fastcheckout_email') || '';
                                } catch (e2) {}
                            }

                            if (!value) {
                                try {
                                    var raw = window.sessionStorage.getItem('fastcheckout_last_guest_address');
                                    var payload = raw ? JSON.parse(raw) : null;
                                    if (payload && payload.values && payload.values.email) {
                                        value = String(payload.values.email || '');
                                    }
                                } catch (e3) {}
                            }

                            value = String(value || '').trim();
                            if (!value || typeof self.email !== 'function') {
                                self.fastcheckoutHardenEmailAutofill();
                                return;
                            }

                            if (self.email() !== value) {
                                self.email(value);
                                if (typeof self.emailHasChanged === 'function') {
                                    self.emailHasChanged();
                                }
                            }

                            self.fastcheckoutHardenEmailAutofill();
                        }, function () {
                            self.fastcheckoutHardenEmailAutofill();
                        });
                        return;
                    }
                } catch (e) {}

                this.fastcheckoutHardenEmailAutofill();
            }
        });
    };
});
