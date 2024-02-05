define(
    [
        'jquery',
        'uiRegistry'
    ],
    function ($, registry) {
        'use strict';

        return {
            validate: function () {
                var $coPaymentForm = $('#co-payment-form'),
                    paymentMethodFormValid = true;

                var activeForm = $coPaymentForm.find('.payment-method._active form:not(.co-billing-form)').first();
                if (activeForm.length) {
                    activeForm.validate({
                        errorClass: 'mage-error',
                        errorElement: 'div',
                        meta: 'validate'
                    });
                    activeForm.validation();
                    paymentMethodFormValid = activeForm.validation('isValid');
                }

                return paymentMethodFormValid;
            }
        };
    }
);
