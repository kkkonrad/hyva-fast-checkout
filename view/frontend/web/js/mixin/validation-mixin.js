define([
    'jquery',
    'Magento_Ui/js/lib/validation/utils',
], function($, utils) {
    return function(validator) {
        validator.addRule(
            'phone',
            function (value) {
                    return utils.isEmptyNoTrim(value) ||
                        /^[+]?[\d{2}]?((\d[\-. ]?)?((\(\d{3}\))|\d{3}))?[\-. ]?\d{3}[\-. ]?\d{4}$/.test(value);
                },
                $.mage.__('Please enter a valid phone number.')

                );
        return validator;
    }
});
