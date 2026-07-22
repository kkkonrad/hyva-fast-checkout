define(['jquery'], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var ko = deps.ko,
            registry = deps.registry,
            getShippingAddressComponent = deps.getShippingAddressComponent,
            getCheckoutProvider = deps.getCheckoutProvider,
            getCountryOptionsByValue = deps.getCountryOptionsByValue,
            getBridgeMessageContainer = deps.getBridgeMessageContainer,
            getCheckoutErrorsComponent = deps.getCheckoutErrorsComponent,
            hasConfiguredEmailComponent = deps.hasConfiguredEmailComponent === true,
            standardShippingViewSelectMethod = null,
            standardShippingInformationComponent = null,
            standardEmailComponent = null;

        function prepareShippingViewCompatibilityComponent() {
            var component = getShippingAddressComponent(),
                provider = getCheckoutProvider();

            if (!component) {
                return null;
            }

            component.source = provider;
            component.isFormInline = true;
            component.countryOptions = getCountryOptionsByValue();
            component.messageContainer = component.messageContainer || getBridgeMessageContainer();

            if (typeof component.errorValidationMessage !== 'function') {
                component.errorValidationMessage = ko.observable(false);
            }

            if (typeof component.triggerShippingDataValidateEvent !== 'function') {
                component.triggerShippingDataValidateEvent = function () {
                    if (provider && typeof provider.trigger === 'function') {
                        provider.trigger('shippingAddress.data.validate');
                        provider.trigger('shippingAddress.custom_attributes.data.validate');
                    }
                };
            }

            if (typeof component.focusInvalid !== 'function') {
                component.focusInvalid = function () {
                    var invalid = document.querySelector('#co-checkout-form [aria-invalid="true"], #co-checkout-form .mage-error, #co-checkout-form .field-error');

                    if (invalid) {
                        invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                };
            }

            getCheckoutErrorsComponent();

            return component;
        }

        function registerShippingViewCompatibilityValidator() {
            if (window.fastcheckoutKoShippingViewValidatorRegistered) {
                return;
            }

            window.fastcheckoutKoShippingViewValidatorRegistered = true;
            window.fastcheckoutCustomShippingValidators = window.fastcheckoutCustomShippingValidators || [];

            require([
                'Magento_Checkout/js/view/shipping'
            ], function (ShippingView) {
                var validateMethod = ShippingView &&
                        ShippingView.prototype &&
                        ShippingView.prototype.validateShippingInformation,
                    validator;

                if (typeof validateMethod !== 'function') {
                    return;
                }

                standardShippingViewSelectMethod = ShippingView &&
                    ShippingView.prototype &&
                    typeof ShippingView.prototype.selectShippingMethod === 'function'
                    ? ShippingView.prototype.selectShippingMethod
                    : null;

                validator = function () {
                    var component,
                        provider,
                        emailValid = true,
                        addressValid = true,
                        emailInput;

                    if (window.fastcheckoutKoShippingViewValidationActive) {
                        return true;
                    }

                    component = prepareShippingViewCompatibilityComponent();
                    if (!component) {
                        return true;
                    }

                    window.fastcheckoutKoShippingViewValidationActive = true;
                    try {
                        provider = getCheckoutProvider();

                        // The stock shipping view checks the shipping method before it
                        // validates the address. Fastcheckout has a separate method card,
                        // so validate the standard KO forms first and show their inline
                        // messages even when no method has been selected yet.
                        emailInput = document.querySelector(
                            'form[data-role="email-with-possible-login"] input[name="username"]'
                        );
                        if (emailInput) {
                            $(emailInput.form).validation();
                            emailValid = Boolean($(emailInput).valid());
                        } else if (
                            standardEmailComponent &&
                            typeof standardEmailComponent.validateEmail === 'function'
                        ) {
                            emailValid = standardEmailComponent.validateEmail() !== false;
                        }

                        if (
                            component.isFormInline &&
                            provider &&
                            typeof provider.set === 'function' &&
                            typeof provider.get === 'function'
                        ) {
                            provider.set('params.invalid', false);
                            component.triggerShippingDataValidateEvent();
                            addressValid = provider.get('params.invalid') !== true;
                        }

                        if (!emailValid || !addressValid) {
                            if (!emailValid) {
                                if (emailInput) {
                                    emailInput.focus();
                                    emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            } else if (typeof component.focusInvalid === 'function') {
                                component.focusInvalid();
                            }

                            return false;
                        }

                        return validateMethod.call(component) !== false;
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: standard shipping view validation could not run.', e);
                        }

                        return true;
                    } finally {
                        window.fastcheckoutKoShippingViewValidationActive = false;
                    }
                };

                validator.fastcheckoutKoShippingView = true;

                if (!window.fastcheckoutCustomShippingValidators.some(function (item) {
                    return item && item.fastcheckoutKoShippingView;
                })) {
                    window.fastcheckoutCustomShippingValidators.push(validator);
                }
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: standard shipping view validator could not be loaded.', error);
                }
            });
        }

        function registerShippingInformationCompatibilityComponent() {
            if (window.fastcheckoutKoShippingInformationRegistered) {
                return;
            }

            window.fastcheckoutKoShippingInformationRegistered = true;

            require([
                'Magento_Checkout/js/view/shipping-information'
            ], function (ShippingInformation) {
                if (typeof ShippingInformation !== 'function') {
                    return;
                }

                try {
                    standardShippingInformationComponent = ShippingInformation({
                        name: 'fastcheckout.shippingInformation',
                        index: 'shipping-information',
                        displayArea: 'shipping-information'
                    });

                    if (standardShippingInformationComponent) {
                        registry.set('fastcheckout.shippingInformation', standardShippingInformationComponent);
                    }
                } catch (e) {
                    standardShippingInformationComponent = null;
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: standard shipping information component could not be initialized.', e);
                    }
                }
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: standard shipping information component could not be loaded.', error);
                }
            });
        }

        function syncEmailCompatibilityComponent(value, triggerChange) {
            var component = standardEmailComponent || window.fastcheckoutKoEmailCompatibilityComponent;

            if (!component || typeof component.email !== 'function' || typeof value === 'undefined') {
                return;
            }

            if (component.email() !== value) {
                component.email(value || '');
            }

            if (triggerChange && typeof component.emailHasChanged === 'function') {
                component.emailHasChanged();
            }
        }

        function registerEmailCompatibilityComponent() {
            if (window.fastcheckoutKoEmailComponentRegistered) {
                return;
            }

            window.fastcheckoutKoEmailComponentRegistered = true;

            if (hasConfiguredEmailComponent && registry && typeof registry.async === 'function') {
                registry.async('checkout.steps.shipping-step.shippingAddress.customer-email')(function (component) {
                    standardEmailComponent = component;
                    window.fastcheckoutKoEmailCompatibilityComponent = component;
                });
                return;
            }

            require([
                'Magento_Checkout/js/view/form/element/email'
            ], function (EmailComponent) {
                var input;

                if (typeof EmailComponent !== 'function') {
                    return;
                }

                try {
                    standardEmailComponent = EmailComponent({
                        name: 'checkout.steps.shipping-step.shippingAddress.customer-email',
                        index: 'customer-email',
                        emailInputId: '#co-shipping-email'
                    });
                    window.fastcheckoutKoEmailCompatibilityComponent = standardEmailComponent;
                    registry.set('checkout.steps.shipping-step.shippingAddress.customer-email', standardEmailComponent);

                    input = document.getElementById('co-shipping-email');
                    if (input) {
                        syncEmailCompatibilityComponent(input.value || '', false);
                        input.addEventListener('input', function () {
                            syncEmailCompatibilityComponent(input.value || '', true);
                        });
                        input.addEventListener('blur', function () {
                            if (
                                standardEmailComponent &&
                                typeof standardEmailComponent.validateEmail === 'function'
                            ) {
                                standardEmailComponent.validateEmail(false);
                            }
                        });
                    }
                } catch (e) {
                    standardEmailComponent = null;
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: standard email component could not be initialized.', e);
                    }
                }
            }, function (error) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: standard email component could not be loaded.', error);
                }
            });
        }

        function runStandardShippingViewSelectMethod(shippingMethod) {
            var component;

            if (!standardShippingViewSelectMethod || !shippingMethod || typeof shippingMethod !== 'object' || window.fastcheckoutKoShippingViewSelectActive) {
                return;
            }

            component = prepareShippingViewCompatibilityComponent();
            if (!component) {
                return;
            }

            window.fastcheckoutKoShippingViewSelectActive = true;
            try {
                standardShippingViewSelectMethod.call(component, shippingMethod);
            } catch (e) {
                if (window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Kkkonrad Fastcheckout: standard shipping view method selection could not run.', e);
                }
            } finally {
                window.fastcheckoutKoShippingViewSelectActive = false;
            }
        }

        function init() {
            registerShippingViewCompatibilityValidator();
            registerShippingInformationCompatibilityComponent();
            registerEmailCompatibilityComponent();
        }

        return {
            init: init,
            prepareShippingViewCompatibilityComponent: prepareShippingViewCompatibilityComponent,
            syncEmailCompatibilityComponent: syncEmailCompatibilityComponent,
            runStandardShippingViewSelectMethod: runStandardShippingViewSelectMethod,
            getShippingInformationComponent: function () {
                return standardShippingInformationComponent;
            }
        };
    };
});
