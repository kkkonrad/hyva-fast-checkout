define(
    [
        'underscore',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/payment/method-list',
        'Magento_Checkout/js/action/select-payment-method'
    ],
    function (_, quote, methodList, selectPaymentMethod) {
        'use strict';
        var freeMethodCode = 'free';

        return {
            isFreeAvailable: false,
            /**
             * Populate the list of payment methods
             * @param {Array} methods
             */
            setPaymentMethods: function (methods) {
                var self = this,
                    freeMethod;
                if (quote.isRestrictPaymentEnable()) {
                    var customerGroupId = quote.getCustomerGroupId().toString();
                    var restrictedPaymentMethods = quote.getRestrictedPaymentMethods();
                    if (customerGroupId && restrictedPaymentMethods) {
                        methods = _.filter(methods, function (method) {
                            var isAvailable = true;
                            if (typeof(restrictedPaymentMethods[method.method]) !== 'undefined') {
                                if (restrictedPaymentMethods[method.method].indexOf(customerGroupId) !== -1) {
                                    isAvailable = false;
                                }
                            }

                            return isAvailable;
                        });
                    }
                }

                freeMethod = _.find(methods, function (method) {
                    return method.method === freeMethodCode;
                });
                this.isFreeAvailable = !!freeMethod;

                if (self.isFreeAvailable && freeMethod && quote.totals().grand_total <= 0) {
                    methods.splice(0, methods.length, freeMethod);
                }

                methodList(methods);
            },
            /**
             * Get the list of available payment methods.
             * @returns {Array}
             */
            getAvailablePaymentMethods: function () {
                var methods = [],
                    self = this;
                _.each(methodList(), function (method) {
                    if (self.isFreeAvailable && (
                        quote.totals().grand_total <= 0 && method.method === freeMethodCode ||
                        quote.totals().grand_total > 0 && method.method !== freeMethodCode
                    ) || !self.isFreeAvailable
                    ) {
                        methods.push(method);
                    }
                });
                if (methods.length === 1 && methods[0].method === "free") {
                    var selectObject = document.getElementById("iwd_opc_payment_method_select");
                    if (selectObject != null) {
                        for (var i = 0; i < selectObject.length; i++) {
                            if (selectObject.options[i].value.indexOf('braintree_cc_vault') >= 0)
                                selectObject.remove(i);
                        }
                    }
                }
                var code = {};
                jQuery("#iwd_opc_payment_method_select > option").each(function () {
                    if (code[this.text]) {
                        jQuery(this).remove();
                    } else {
                        code[this.text] = this.value;
                    }
                });
                return methods;
            }
        };
    }
);
