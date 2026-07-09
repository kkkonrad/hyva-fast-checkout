define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            additionalValidators = deps.additionalValidators,
            optionalValidationComponentsRequested = false,
            paymentDataAssigners = [];

        window.fastcheckoutPaymentDataAssigners = window.fastcheckoutPaymentDataAssigners || [];
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

        function registerPaymentDataAssignerOnce(assigner) {
            if (typeof assigner !== 'function' || paymentDataAssigners.indexOf(assigner) !== -1) {
                return;
            }

            paymentDataAssigners.push(assigner);
        }

        function registerPaymentDataAssigner(assigner) {
            if (typeof assigner !== 'function') {
                return;
            }

            if (window.fastcheckoutPaymentDataAssigners.indexOf(assigner) === -1) {
                window.fastcheckoutPaymentDataAssigners.push(assigner);
            }

            registerPaymentDataAssignerOnce(assigner);
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
                'Magento_CheckoutAgreements/js/model/agreement-validator',
                'Magento_CheckoutAgreements/js/model/agreements-assigner'
            ], function (agreementValidator, agreementsAssigner) {
                registerAdditionalValidatorOnce(agreementValidator);
                registerPaymentDataAssignerOnce(agreementsAssigner);
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: optional checkout agreements validators could not be loaded.', error);
                }
            });
        }

        function loadConfiguredComponents(flagName, componentNamesName, components, warningMessage) {
            if (window[flagName] || !components.length) {
                return;
            }

            window[flagName] = true;
            window[componentNamesName] = components.slice(0);
            require(components, function () {}, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn(warningMessage, error);
                }
            });
        }

        function loadShippingRatesValidationComponents() {
            loadConfiguredComponents(
                'fastcheckoutShippingRatesValidationComponentsLoaded',
                'fastcheckoutShippingRatesValidationComponentNames',
                config.shippingRatesValidationComponents || [],
                'Kkkonrad Fastcheckout: shipping rates validation components could not be loaded.'
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

        function applyPaymentDataAssigners(paymentData) {
            paymentDataAssigners.forEach(function (assigner) {
                try {
                    assigner(paymentData);
                } catch (e) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: payment data assigner failed.', e);
                    }
                }
            });
        }

        function validateAdditionalValidators(hideError, fallbackValidator) {
            var isValid = true;

            if (!additionalValidators || typeof additionalValidators.validate !== 'function') {
                return typeof fallbackValidator === 'function' ? fallbackValidator() : true;
            }

            try {
                isValid = additionalValidators.validate(!!hideError);
            } catch (e) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: additional checkout validation failed.', e);
                }
                return false;
            }

            return isValid && (typeof fallbackValidator === 'function' ? fallbackValidator() : true);
        }

        window.fastcheckoutPaymentDataAssigners.forEach(registerPaymentDataAssignerOnce);
        window.fastcheckoutPaymentValidators.forEach(registerAdditionalValidatorOnce);

        return {
            registerPaymentValidator: registerPaymentValidator,
            registerPaymentDataAssigner: registerPaymentDataAssigner,
            registerShippingValidator: registerShippingValidator,
            loadOptionalValidationComponents: loadOptionalValidationComponents,
            loadShippingRatesValidationComponents: loadShippingRatesValidationComponents,
            loadPaymentValidationComponents: loadPaymentValidationComponents,
            applyPaymentDataAssigners: applyPaymentDataAssigners,
            validateAdditionalValidators: validateAdditionalValidators
        };
    };
});
