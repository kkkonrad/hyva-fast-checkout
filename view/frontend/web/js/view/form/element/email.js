define([
    'jquery',
    'uiComponent',
    'uiRegistry',
    'ko',
    'Magento_Customer/js/action/check-email-availability',
    'Magento_Customer/js/action/login',
    'IWD_Opc/js/action/reset',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/checkout-data',
    'IWD_Opc/js/model/login/messageList',
    'mage/translate',
    'mage/validation',
    'mage/storage',
    'Magento_Checkout/js/model/url-builder',
    'IWD_Opc/js/ga4Events'
], function ($, Component, registry, ko, checkEmailAvailability, loginAction, resetAction, quote, checkoutData, messageContainer, $t, $v, storage, urlBuilder, ga4Events) {
    'use strict';

    var validatedEmail = checkoutData.getValidatedEmailValue();

    if (validatedEmail && !quote.isCustomerLoggedIn()) {
        quote.guestEmail = validatedEmail;
    }

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/form/element/email',
            email: checkoutData.getInputFieldEmailValue(),
            emailFocused: false,
            passwordFocused: false,
            isLoading: false,
            isPasswordVisible: checkoutData.getIsPasswordVisible(),
            listens: {
                email: 'emailHasChanged',
                emailFocused: 'validateEmail'
            }
        },
        passwordType: ko.observable('password'),
        checkDelay: 1000,
        checkRequest: null,
        isEmailCheckComplete: null,
        isCustomerLoggedIn: quote.isCustomerLoggedIn(),
        forgotPasswordUrl: quote.getForgotPasswordUrl(),
        emailCheckTimeout: 0,

        checkoutData: window.checkoutData,

        getInputFieldEmailValue: function () {
            return checkoutData.getInputFieldEmailValue();
        },

        initObservable: function () {
            var self = this;
            this._super()
                .observe(['email', 'emailFocused', 'passwordFocused', 'isLoading', 'isPasswordVisible']);

            self.isPasswordVisible(false);

            self.checkoutData.login = this;

            $(document).on('click', '#iwd_opc_top_login_button', function () {
                if(self.isPasswordVisible()){
                    self.isPasswordVisible(false)
                }else{
                    self.isPasswordVisible(true);
                    if (!self.email()) {
                        self.emailFocused(true);
                    } else {
                        self.passwordFocused(true);
                    }
                }
            });

            return this;
        },

        onCustomerEmailChange: function() {
            if(!quote.isCustomerLoggedIn() && !quote.guestEmail) return true;

            let self = this,customerData = {};
            self.emailHasChanged();
            customerData.customerEmail = checkoutData.getInputFieldEmailValue();
            customerData.isEmailValid = false;
            if(self.validateEmail()){
                customerData.isEmailValid = true;
                self.checkoutData.infoBlock.updateCustomerEmailItem(customerData);
            }else{
                self.checkoutData.infoBlock.updateCustomerEmailItem(customerData)
            }
            return true;
        },

        emailHasChanged: function () {
            var self = this;

            clearTimeout(this.emailCheckTimeout);

            if (self.validateEmail()) {
                quote.guestEmail = self.email();
                checkoutData.setValidatedEmailValue(self.email());
            }

            this.emailCheckTimeout = setTimeout(function () {
                if (self.validateEmail()) {
                    self.checkEmailAvailability();
                    self.showPasswordFieldForCustomer();
                } else {
                    self.isPasswordVisible(false);
                    checkoutData.setIsPasswordVisible(false);
                }
            }, self.checkDelay);

            checkoutData.setInputFieldEmailValue(self.email());
        },

        checkEmailAvailability: function () {
            var self = this;
            this.validateRequest();
            this.isEmailCheckComplete = $.Deferred();
            this.isLoading(true);
            this.checkRequest = checkEmailAvailability(this.isEmailCheckComplete, this.email());

            $.when(this.isEmailCheckComplete).done(function () {
                //Waiting Email Check Complete
                // Do nothing
            }).fail(function () {
                //Waiting Email Check Complete
                // Do nothing
            }).always(function () {
                self.isLoading(false);
            });
        },

        showPasswordFieldForCustomer: function () {
            var self = this;
            let response = storage.post(
                    urlBuilder.createUrl('/customers/isEmailAvailable', {}),
                    JSON.stringify({customerEmail: self.email()}),
                    false
                );

            $.when(response)
                .done(function (isEmailAvailable) {
                    if (isEmailAvailable) {
                        self.isPasswordVisible(false);
                        checkoutData.setIsPasswordVisible(false);
                    } else {
                        self.isPasswordVisible(true);
                        checkoutData.setIsPasswordVisible(true);
                    }
                }).fail(function () { console.log('showPasswordFieldForCustomer fail') })
        },

        validateRequest: function () {
            if (this.checkRequest !== null && $.inArray(this.checkRequest.readyState, [1, 2, 3])) {
                this.checkRequest.abort();
                this.checkRequest = null;
            }
        },

        validateEmail: function (focused) {
            var loginFormSelector = 'form[data-role=email-with-possible-login]',
                usernameSelector = loginFormSelector + ' input[name=username]',
                loginForm = $(loginFormSelector);

            if(typeof focused !== 'undefined' && !$(usernameSelector).val()) {
                return true;
            }

            loginForm.validation();

            if (focused === false && !!this.email()) {
                return !!$(usernameSelector).valid();
            }

            return $(usernameSelector).valid();
        },

        toggleShowHidePassword: function (data, event) {
            this.passwordType(this.passwordType() === 'text' ? 'password' : 'text');
        },

        reset: function () {
            var resetData = {},
                self = this;
            resetData['email'] = self.email();

            if (self.validateEmail()) {
                self.isLoading(true);
                ga4Events.recoverPasswordEvent();
                resetAction(resetData, undefined, undefined, messageContainer).always(function () {
                    self.isLoading(false);
                });
            }
        },

        login: function (loginForm) {
            var loginData = {},
                self = this,
                formDataArray = $(loginForm).serializeArray();

            formDataArray.forEach(function (entry) {
                loginData[entry.name] = entry.value;
            });

            if (this.isPasswordVisible() && $(loginForm).validation() && $(loginForm).validation('isValid')) {
                ga4Events.loginEvent();
                loginAction(loginData, undefined, undefined, messageContainer, self);
            } else {
                ga4Events.failedLoginEvent();
            }
        }
    });
});
