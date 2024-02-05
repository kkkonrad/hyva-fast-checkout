define(
    [
        'jquery',
        "underscore",
        'uiComponent',
        'ko',
        'PayPal_Braintree/js/view/payment/adapter',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/payment-service',
        'Magento_Checkout/js/model/payment/method-converter',
        'Magento_Checkout/js/action/get-payment-information',
        'Magento_Checkout/js/model/checkout-data-resolver',
        'mage/translate',
        'Magento_Checkout/js/checkout-data',
        'Magento_Checkout/js/model/full-screen-loader',
        'Magento_Checkout/js/model/payment/method-list',
        'Magento_Checkout/js/model/payment/additional-validators',
        'uiRegistry',
        'IWD_Opc/js/model/payment/is-loading',
        'Magento_Checkout/js/action/set-billing-address',
        'Magento_Ui/js/model/messageList',
        'mage/validation',
        'IWD_Opc/js/ga4Events'
    ],
    function ($,
              _,
              Component,
              ko,
              Braintree,
              quote,
              paymentService,
              methodConverter,
              getPaymentInformation,
              checkoutDataResolver,
              $t,
              checkoutData,
              fullScreenLoader,
              methodList,
              additionalValidators,
              registry,
              paymentIsLoading,
              setBillingAddressAction,
              globalMessageList,
              validation,
              ga4Events
    ) {
        'use strict';

        /** Set payment methods to collection */
        paymentService.setPaymentMethods(methodConverter(window.checkoutConfig.paymentMethods));

        $.validator.addMethod('validate-iwd-opc-cc-exp', function (value, element) {
            var isValid = false;
            var monthField = $(element).closest('.field').find('select[name="payment[cc_exp_month]"]');
            var yearField = $(element).closest('.field').find('select[name="payment[cc_exp_year]"]');
            if (monthField.length && yearField.length) {
                isValid = monthField.val() && yearField.val();
            }

            return isValid;
        }, 'This is a required field.');

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment',
                activeMethod: ''
            },
            isLoading: paymentIsLoading.isLoading,
            isShowSubscribe: quote.isShowSubscribe(),
            isSubscribe: ko.observable(checkoutData.getIsSubscribe()),
            quoteIsVirtual: quote.isVirtual(),
            isPaymentMethodsAvailable: ko.computed(function () {
                return paymentService.getAvailablePaymentMethods().length > 0;
            }),
            isPlaceOrderActionAllowed: ko.observable(true),

            errorValidationMessage: ko.observable(false),
            checkoutData: window.checkoutData,

            startLoader: function(){
                window.fullScreenLoader.startLoader();
            },

            stopLoader: function(timeout = 2000){
                setTimeout(function () {
                    window.fullScreenLoader.stopLoader();
                },timeout)
            },

            goToDeliveryStep: function(){
                let summary = self.checkoutData.summary;

                this.startLoader();
                summary.updateSummaryWrapperTopHeight(0);
                this.PaymentStep(false);
                this.checkoutData.shipping.DeliveryStep(true);
                this.checkoutData.shipping.updateBreadcrumbs('delivery');
                this.stopLoader(1000);
            },

            goToBillingVirtualStep: function () {
                let summary = self.checkoutData.summary;

                this.startLoader();
                summary.updateSummaryWrapperTopHeight(0);
                this.PaymentStep(false);
                this.checkoutData.billingStepVirtual.AddressStep(true);
                this.checkoutData.shipping.updateBreadcrumbs('address');
                this.stopLoader(1000);
            },

            getDesignResolution: function(design){
                return this.checkoutData.layout.design;
            },

            reInitPayPal: function () {
                if (window.checkoutData && window.checkoutData.paypal) {
                    let token = false,
                        currency = false;

                    if (window.checkoutConfig && window.checkoutConfig.totalsData && window.checkoutConfig.totalsData.base_currency_code) {
                        currency = window.checkoutConfig.totalsData.base_currency_code;
                    }

                    if (window.checkoutConfig && window.checkoutConfig.payment
                        && window.checkoutConfig.payment.braintree && window.checkoutConfig.payment.braintree.clientToken) {
                        token = window.checkoutConfig.payment.braintree.clientToken;
                    }

                    $('.action-braintree-paypal-logo').each(function () {
                        if($(this).hasClass( "button-loaded" )) {
                            $(this).removeClass('button-loaded');
                        }
                    });

                    if (token && currency) {
                        window.checkoutData.paypal.init(token,currency)
                    }
                }
            },

            isActiveBraintreePaypal: function () {
                let activePaymentMethod = $('.payment-method._active');

                if (activePaymentMethod.length && activePaymentMethod.attr('id') === 'payment-method-braintree-paypal') {
                    return true;
                }

                return false;
            },

            initialize: function () {
                this._super().observe({
                    PaymentStep: ko.observable(false),
                    isMultiStepResolution: ko.observable(false),
                });

                this.checkoutData.payment = this;

                this.navigate();

                let self = this,
                    secondaryPlaceOrder = self.checkoutData.secondaryPlaceOrder,
                    summary = self.checkoutData.summary;

                self.isMultiStepResolution.subscribe(function (status) {
                    if (status) {
                        secondaryPlaceOrder.isVisible(false);
                    } else {
                        if (self.isActiveBraintreePaypal()) {
                            secondaryPlaceOrder.isVisible(false);
                        } else {
                            secondaryPlaceOrder.isVisible(true);
                        }
                    }
                })

                self.PaymentStep.subscribe(function (status) {
                    summary.updateSummaryWrapperTopHeight(0);
                    if (self.isMultiStepResolution() && status) {
                        if (self.isActiveBraintreePaypal()) {
                            secondaryPlaceOrder.isVisible(false);
                        } else {
                            secondaryPlaceOrder.isVisible(true);
                        }
                    } else if (self.isMultiStepResolution() && !status) {
                        secondaryPlaceOrder.isVisible(false);
                    } else {
                        if (self.isActiveBraintreePaypal()) {
                            secondaryPlaceOrder.isVisible(false);
                        } else {
                            secondaryPlaceOrder.isVisible(true);
                        }
                    }
                });

                this.isSubscribe.subscribe(function (value) {
                    checkoutData.setIsSubscribe(value);
                });

                $(document).on('click', '.payment-method:not(._active)', function (e) {
                    self.errorValidationMessage(false);
                    let method = $(this).find('input[name="payment[method]"]');

                    ga4Events.changePaymentMethod(method.data('title'));
                    method.click();

                    if ($(this).attr('id') === 'payment-method-braintree-paypal') {
                        $('#braintree_paypal_placeholder').show();
                        $('.place_button_wrapper > button').hide();
                        setTimeout(function (){
                            self.reInitPayPal();

                        },1000);
                    } else {
                        $('.place_button_wrapper > button').show();
                        $('#braintree_paypal_placeholder').hide();
                    }
                });

                $(document).on('mouseover', '.iwd_opc_cc_types_tooltip', function () {
                    var fixedContent = $(this).find('.iwd_opc_field_tooltip_content');
                    if (fixedContent.length) {
                        fixedContent.offset({
                            left: $(this).offset().left - fixedContent.width() - 44,
                            top: $(this).offset().top - (fixedContent.height() / 2) + 2
                        });
                    }
                });

                $(document).on('input', '.iwd_opc_cc_wrapper .iwd_opc_cc_input', function (e) {
                    self.formatCcNumber($(this), e);
                    var v = $(this).val().replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                    self.fillCcNumberField($(this), v);
                });

                $(document).on('keydown', '.iwd_opc_cc_exp, .iwd_opc_cc_wrapper .iwd_opc_cc_input', function (e) {
                    self.checkNumberInput($(this), e);
                });

                $(document).on('input', '.iwd_opc_cc_exp', function (e) {
                    var value = $(this).val();
                    if (value.length > 2 && value[2] !== '/') {
                        var cursorPosition = $(this).prop('selectionStart');
                        value = value.replace('/', '');
                        var month = value.substring(0, 2);
                        var year = value.substring(2);
                        value = month + '/' + year;
                        value = value.substring(0, 7);
                        $(this).val(value);
                        $(this).selectRange(cursorPosition + 1);
                    }

                    var ccExpMonthYearArr = value.split('/');
                    var is_valid = false;
                    if (ccExpMonthYearArr[0] && ccExpMonthYearArr[1]) {
                        var ccExpMonth = parseInt(ccExpMonthYearArr[0]);
                        var ccExpYear = parseInt(ccExpMonthYearArr[1]);
                        var currentTime = new Date();
                        var currentMonth = currentTime.getMonth() + 1;
                        var currentYear = currentTime.getFullYear();
                        if (ccExpMonth > 12) {
                            is_valid = false;
                        } else if (ccExpYear > currentYear) {
                            is_valid = true;
                        } else if (ccExpMonth >= currentMonth && ccExpYear === currentYear) {
                            is_valid = true;
                        }

                        if (is_valid) {
                            self.fillCcExpDateFields($(this), ccExpMonth, ccExpYear);
                        }
                    }

                    if (!is_valid) {
                        self.fillCcExpDateFields($(this), '', '');
                    }
                });

                let paymentMethodInterval = setInterval(function (){
                    if ($('.payment-method').length) {
                        if ($('.payment-method._active').length) {
                            if ($('.payment-method._active').attr('id') ===  'payment-method-braintree-paypal') {
                                $('#braintree_paypal_placeholder').show();
                                $('.place_button_wrapper > button').hide();
                                setTimeout(function (){
                                    self.reInitPayPal();
                                },1000);
                            }
                        }
                        clearInterval(paymentMethodInterval);
                    }
                },500);

                window.IWDStartPlacingOrder = false;

                return this;
            },
            formatCcNumber: function (element, e) {
                var value = element.val();
                if (value) {
                    var clear_value = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                    var formatted_value = clear_value;
                    var cursorPosition = element.prop('selectionStart');
                    var matches = clear_value.match(/\d{4,24}/g);
                    var match = matches && matches[0] || '';
                    var parts = [];
                    for (var i = 0; i < match.length; i += 4) {
                        parts.push(match.substring(i, i + 4))
                    }

                    if (parts.length) {
                        formatted_value = parts.join(' ');
                        var test_value = value.substring(0, cursorPosition);
                        var test_formatted_value = formatted_value.substring(0, cursorPosition);
                        var test_value_length = test_value.match(/ /g) ? test_value.match(/ /g).length : 0;
                        var test_formatted_value_length = test_formatted_value.match(/ /g) ? test_formatted_value.match(/ /g).length : 0;
                        if (test_formatted_value_length > test_value_length) {
                            cursorPosition = cursorPosition + test_formatted_value_length - test_value_length;
                        }
                    }

                    if ((cursorPosition % 5) === 0) {
                        cursorPosition = cursorPosition - 1;
                    }

                    element.val(formatted_value);
                    element.selectRange(cursorPosition);
                }
            },

            fillCcNumberField: function (element, value) {
                var ccNumberField = element.closest('.field').find('input.iwd_opc_cc_real_input');
                if (ccNumberField.length) {
                    ccNumberField.val(value);
                    ccNumberField.trigger('keyup');
                    ccNumberField.trigger('value');
                    ccNumberField.trigger('input');
                }
            },

            fillCcExpDateFields: function (element, expMonth, expYear) {
                var monthField = element.closest('.field').find('select[name="payment[cc_exp_month]"]');
                var yearField = element.closest('.field').find('select[name="payment[cc_exp_year]"]');

                if (monthField.length && yearField.length) {
                    monthField.val(expMonth).trigger('change');
                    yearField.val(expYear).trigger('change');
                }
            },

            checkNumberInput: function (element, e) {
                if ($.inArray(e.keyCode, [46, 8, 9, 27, 13, 110, 190]) !== -1 ||
                    (e.keyCode === 65 && e.ctrlKey === true) ||
                    e.ctrlKey === true ||
                    e.shiftKey === true ||
                    (e.keyCode === 67 && e.ctrlKey === true) ||
                    (e.keyCode === 88 && e.ctrlKey === true) ||
                    (e.keyCode >= 35 && e.keyCode <= 39)) {
                    return true;
                } else if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                    e.preventDefault();
                    return false;
                }

                return null;
            },
            navigate: function () {
                var self = this;
                paymentIsLoading.isLoading(true);
                getPaymentInformation().always(function () {
                    paymentIsLoading.isLoading(false);
                });
            },

            getFormKey: function () {
                return window.checkoutConfig.formKey;
            },

            placeOrder: function (data, event) {
                var self = this,
                    shipping = self.checkoutData.shipping,
                    billing = self.checkoutData.billing;

                window.IWDStartPlacingOrder = true;
                shipping.addressHandler();
                billing.addressHandler();

                this.isPlaceOrderActionAllowed(false);

                if (event) {
                    event.preventDefault();
                }

                if (!quote.paymentMethod()) {
                    this.errorValidationMessage(
                        $t('The payment method is missing. Select the payment method and try again.')
                    );

                    ga4Events.failedPaymentEvent();
                    this.isPlaceOrderActionAllowed(true);
                    return false;
                } else {
                    if (quote.isVirtual()) {
                        if (billing.isAddressHasError()) {
                            ga4Events.failedPaymentEvent();
                            this.isPlaceOrderActionAllowed(true);
                            return false;
                        }
                    } else {
                        if (shipping.isAddressHasError()) {
                            ga4Events.failedPaymentEvent();
                            this.isPlaceOrderActionAllowed(true);
                            return false;
                        }
                    }

                    if (additionalValidators.validate()) {
                        if (quote.paymentMethod().method === 'braintree_paypal') {
                            this.isPlaceOrderActionAllowed(true);
                            Braintree.checkout.paypal.initAuthFlow();
                        }
                        else {
                            if (!quote.isVirtual()) {
                                var shippingAddress = registry.get('checkout.steps.shipping-step.shippingAddress');

                                shippingAddress.setShippingInformation()
                                    .done(function () {
                                        localStorage.setItem('custom_attributes', JSON.stringify(shippingAddress.source.shippingAddress));
                                        self.clickNativePlaceOrder();
                                    })
                                    .fail(function () {
                                        self.stopLoader(1000);
                                        self.isPlaceOrderActionAllowed(true);
                                        window.IWDStartPlacingOrder = false;
                                        ga4Events.failedPaymentEvent();
                                    });

                            } else {
                                this.isPlaceOrderActionAllowed(true);
                                $('.payment-method._active button[type=submit].checkout').click();
                            }
                        }
                    } else {
                        ga4Events.failedPaymentEvent();
                        this.isPlaceOrderActionAllowed(true);
                        return false;
                    }
                }
            },
            clickNativePlaceOrder: function () {
                this.isPlaceOrderActionAllowed(true);
                $('.payment-method._active button[type=submit].checkout').click();
                window.IWDStartPlacingOrder = false;
            }
        });
    }
);
