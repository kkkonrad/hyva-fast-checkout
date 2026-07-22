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
                    // After KO paint + after any delayed Magento re-render of email.
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 0);
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 400);
                    setTimeout(this.fastcheckoutHardenEmailAutofill.bind(this), 1200);
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

            fastcheckoutHardenEmailAutofill: function () {
                var selector = this.emailInputId || '#customer-email',
                    input = document.querySelector(selector) || document.getElementById('customer-email');

                hardenEmailInput(input);
                removeHiddenPasswordFields();
            }
        });
    };
});
