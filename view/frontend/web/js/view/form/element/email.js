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
    'mage/validation'
], function ($, Component, registry, ko, checkEmailAvailability, loginAction, resetAction, quote, checkoutData, messageContainer, $t) {
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
            if($('body').hasClass('ajax-loading')) {
                return true;
            }

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
                self.isPasswordVisible(false);
                checkoutData.setIsPasswordVisible(false);
            }).fail(function () {
                //self.isPasswordVisible(true);
                //checkoutData.setIsPasswordVisible(true);
            }).always(function () {
                self.isLoading(false);
            });
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
                loginForm = $(loginFormSelector),
                validator;

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
                loginAction(loginData, undefined, undefined, messageContainer, self);
            }
        }
    });
});
