define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            additionalValidators = deps.additionalValidators,
            optionalValidationComponentsRequested = false;

        window.fastcheckoutPaymentValidators = window.fastcheckoutPaymentValidators || [];
        window.fastcheckoutCustomShippingValidators = window.fastcheckoutCustomShippingValidators || [];

        function registerAdditionalValidatorOnce(validator) {
            if (!additionalValidators || !validator || typeof validator.validate !== 'function') {
                return;
            }

            if (
                typeof additionalValidators.getValidators === 'function' &&
                additionalValidators.getValidators().indexOf(validator) !== -1
            ) {
                return;
            }

            if (typeof additionalValidators.registerValidator === 'function') {
                additionalValidators.registerValidator(validator);
            }
        }

        function registerPaymentValidator(validator) {
            if (!validator || typeof validator.validate !== 'function') {
                return;
            }

            if (window.fastcheckoutPaymentValidators.indexOf(validator) === -1) {
                window.fastcheckoutPaymentValidators.push(validator);
            }

            registerAdditionalValidatorOnce(validator);
        }

        function registerShippingValidator(validator) {
            if (typeof validator !== 'function' || window.fastcheckoutCustomShippingValidators.indexOf(validator) !== -1) {
                return;
            }

            window.fastcheckoutCustomShippingValidators.push(validator);
        }

        function loadOptionalValidationComponents() {
            if (optionalValidationComponentsRequested) {
                return;
            }

            optionalValidationComponentsRequested = true;

            if (
                !window.checkoutConfig ||
                !window.checkoutConfig.checkoutAgreements ||
                !window.checkoutConfig.checkoutAgreements.isEnabled
            ) {
                return;
            }

            require([
                'Magento_CheckoutAgreements/js/model/agreement-validator'
            ], function (agreementValidator) {
                registerAdditionalValidatorOnce(agreementValidator);
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: optional checkout agreements validators could not be loaded.', error);
                }
            });
        }

        function loadConfiguredComponents(
            flagName,
            componentNamesName,
            components,
            warningMessage,
            onLoaded
        ) {
            if (window[flagName] || !components.length) {
                if (typeof onLoaded === 'function') {
                    onLoaded();
                }
                return;
            }

            window[flagName] = true;
            window[componentNamesName] = components.slice(0);
            require(components, function () {
                if (typeof onLoaded === 'function') {
                    onLoaded();
                }
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn(warningMessage, error);
                }
            });
        }

        function loadShippingRatesValidationComponents(onLoaded) {
            loadConfiguredComponents(
                'fastcheckoutShippingRatesValidationComponentsLoaded',
                'fastcheckoutShippingRatesValidationComponentNames',
                config.shippingRatesValidationComponents || [],
                'Kkkonrad Fastcheckout: shipping rates validation components could not be loaded.',
                onLoaded
            );
        }

        function loadPaymentValidationComponents() {
            loadConfiguredComponents(
                'fastcheckoutPaymentValidationComponentsLoaded',
                'fastcheckoutPaymentValidationComponentNames',
                config.paymentValidationComponents || [],
                'Kkkonrad Fastcheckout: payment validation components could not be loaded.'
            );
        }

        window.fastcheckoutPaymentValidators.forEach(registerAdditionalValidatorOnce);

        return {
            registerPaymentValidator: registerPaymentValidator,
            registerShippingValidator: registerShippingValidator,
            loadOptionalValidationComponents: loadOptionalValidationComponents,
            loadShippingRatesValidationComponents: loadShippingRatesValidationComponents,
            loadPaymentValidationComponents: loadPaymentValidationComponents
        };
    };
});
