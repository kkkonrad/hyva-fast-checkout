define([
    'jquery'
], function ($) {
    'use strict';

    function isEnabled() {
        return !!(
            window.checkoutConfig &&
            window.checkoutConfig.checkoutAgreements &&
            window.checkoutConfig.checkoutAgreements.isEnabled
        );
    }

    function assign(paymentData) {
        var agreementIds = [];

        if (!paymentData || !isEnabled()) {
            return paymentData;
        }

        $('.payment-method._active div[data-role=checkout-agreements] input').serializeArray().forEach(function (item) {
            agreementIds.push(item.value);
        });

        if (!agreementIds.length) {
            return paymentData;
        }

        paymentData.extension_attributes = paymentData.extension_attributes || {};
        if (!paymentData.extension_attributes.agreement_ids) {
            paymentData.extension_attributes.agreement_ids = agreementIds;
        }

        return paymentData;
    }

    function validate(hideError) {
        var inputs,
            isValid = true,
            firstInvalid = null;

        if (!isEnabled()) {
            return true;
        }

        inputs = $('.payment-method._active div.checkout-agreements input');
        if (!inputs.length) {
            return true;
        }

        inputs.each(function (index, element) {
            var valid = true;

            if ($.validator && typeof $.validator.validateSingleElement === 'function') {
                valid = $.validator.validateSingleElement(element, {
                    errorElement: 'div',
                    hideError: !!hideError
                });
            } else if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
                valid = false;
            }

            if (!valid) {
                isValid = false;
                if (!firstInvalid) {
                    firstInvalid = element;
                }
            }
        });

        if (!isValid && firstInvalid && !hideError) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return isValid;
    }

    return {
        assign: assign,
        validate: validate
    };
});
