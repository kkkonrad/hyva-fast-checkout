define(
    [
        'jquery',
        'mage/validation'
    ],
    function ($) {
        'use strict';
        var checkoutConfig = window.checkoutConfig,
            agreementsConfig = checkoutConfig ? checkoutConfig.checkoutAgreements : {};

        var agreementsInputPath = '.iwd_opc_payment_column div[data-role=checkout-agreements] input';

        return {
            /**
             * Validate checkout agreements
             *
             * @returns {boolean}
             */
            validate: function () {
                var isValid = true;

                if (!agreementsConfig.isEnabled || $(agreementsInputPath).length === 0) {
                    return true;
                }

                $(agreementsInputPath).each(function (index, element) {
                    $(element).parent().children('div.mage-error[generated]').remove();

                    if (!$.validator.validateSingleElement(element, {
                            errorClass: 'mage-error',
                            errorElement: 'div',
                            meta: 'validate',
                            errorPlacement: function (error, element) {
                                var errorPlacement = element;
                                if (element.is(':checkbox') || element.is(':radio')) {
                                    errorPlacement = element.siblings('label').last();
                                }
                                errorPlacement.after(error);
                            }
                        })) {

                        isValid = false;
                    }
                });

                return isValid;
            }
        };
    }
);
