define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (braintreeAdapter) {
        if (braintreeAdapter && typeof braintreeAdapter.tokenizeHostedFields === 'function') {
            braintreeAdapter.tokenizeHostedFields = wrapper.wrap(braintreeAdapter.tokenizeHostedFields, function (originalTokenize) {
                var self = this;

                if (!isFastcheckoutActive()) {
                    return originalTokenize.apply(this, Array.prototype.slice.call(arguments, 1));
                }

                if (self.hostedFieldsInstance && !self.hostedFieldsInstance.__isWrappedForFastcheckout) {
                    self.hostedFieldsInstance.__isWrappedForFastcheckout = true;
                    var originalTokenizeMethod = self.hostedFieldsInstance.tokenize;
                    self.hostedFieldsInstance.tokenize = function (options, callback) {
                        return originalTokenizeMethod.call(self.hostedFieldsInstance, options, function (err, payload) {
                            if (err) {
                                // 1. Highlight invalid fields in red manually
                                var fieldsMap = {
                                    'number': 'braintree_cc_number',
                                    'expirationDate': 'braintree_expirationDate',
                                    'cvv': 'braintree_cc_cid'
                                };
                                if (err.code === 'HOSTED_FIELDS_FIELDS_EMPTY') {
                                    Object.values(fieldsMap).forEach(function (id) {
                                        var el = document.getElementById(id);
                                        if (el) el.classList.add('braintree-hosted-fields-invalid');
                                    });
                                } else if (err.details && err.details.invalidFieldKeys) {
                                    err.details.invalidFieldKeys.forEach(function (key) {
                                        var id = fieldsMap[key];
                                        if (id) {
                                            var el = document.getElementById(id);
                                            if (el) el.classList.add('braintree-hosted-fields-invalid');
                                        }
                                    });
                                }

                                // 2. Display translated error message on the screen
                                var errMsg = err.message || 'Braintree tokenization failed';
                                if (err.code === 'HOSTED_FIELDS_FIELDS_EMPTY') {
                                    errMsg = 'Proszę wypełnić wszystkie pola karty kredytowej.';
                                } else if (err.code === 'HOSTED_FIELDS_FIELDS_INVALID') {
                                    errMsg = 'Niektóre pola karty kredytowej są niepoprawne. Sprawdź wpisane dane.';
                                } else {
                                    errMsg = 'Błąd autoryzacji karty: ' + errMsg;
                                }
                                if (typeof self.showError === 'function') {
                                    self.showError(errMsg);
                                }

                                // 3. Reset the Braintree cc-form component processing state
                                var activeComponent = window.fastcheckoutHyvaPayment && typeof window.fastcheckoutHyvaPayment.getActiveRenderer === 'function' 
                                    ? window.fastcheckoutHyvaPayment.getActiveRenderer() 
                                    : null;
                                if (activeComponent) {
                                    activeComponent.isProcessing = false;
                                }
                                // 4. Reset the Fastcheckout loader/processing state
                                if (window.fastcheckoutHyvaPayment && window.fastcheckoutHyvaPayment.syncReject) {
                                    var rejectFn = window.fastcheckoutHyvaPayment.syncReject;
                                    window.fastcheckoutHyvaPayment.syncResolve = null;
                                    window.fastcheckoutHyvaPayment.syncReject = null;
                                    rejectFn(new Error(errMsg));
                                }
                            }
                            return callback(err, payload);
                        });
                    };
                }
                return originalTokenize.apply(this, Array.prototype.slice.call(arguments, 1));
            });
        }
        return braintreeAdapter;
    };
});
