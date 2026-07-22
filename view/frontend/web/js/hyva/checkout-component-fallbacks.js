define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var ko = deps.ko,
            registry = deps.registry,
            quote = deps.quote,
            getCheckoutProvider = typeof deps.getCheckoutProvider === 'function' ? deps.getCheckoutProvider : function () { return null; },
            translate = typeof deps.translate === 'function' ? deps.translate : function (message) { return message; };

        function createShippingAddressComponentFallback() {
            var component = {
                name: 'fastcheckout.shippingAddress',
                index: 'shippingAddress',
                isFormInline: true,
                source: getCheckoutProvider(),
                errorValidationMessage: function (message) {
                    if (arguments.length) {
                        component.errorMessage = message || false;
                        if (message && typeof document !== 'undefined') {
                            document.dispatchEvent(new CustomEvent('fastcheckout:shipping-error', {
                                detail: {
                                    message: message
                                }
                            }));
                        }
                    }

                    return component.errorMessage || false;
                },
                validateShippingInformation: function () {
                    var provider = getCheckoutProvider(),
                        isValid = true;

                    if (provider && typeof provider.set === 'function') {
                        provider.set('params.invalid', false);
                    }

                    if (!quote.isVirtual || !quote.isVirtual()) {
                        if (!quote.shippingMethod || !quote.shippingMethod()) {
                            this.errorValidationMessage(translate('The shipping method is missing. Select the shipping method and try again.'));
                            if (provider && typeof provider.set === 'function') {
                                provider.set('params.invalid', true);
                            }
                            return false;
                        }
                    }

                    if (
                        window.fastcheckoutHyvaShipping &&
                        typeof window.fastcheckoutHyvaShipping.validate === 'function'
                    ) {
                        isValid = window.fastcheckoutHyvaShipping.validate();
                    }

                    if (!isValid && provider && typeof provider.set === 'function') {
                        provider.set('params.invalid', true);
                    }

                    return isValid && !(provider && provider.get && provider.get('params.invalid'));
                },
                triggerShippingDataValidateEvent: function () {
                    var provider = getCheckoutProvider();

                    if (provider && typeof provider.trigger === 'function') {
                        provider.trigger('shippingAddress.data.validate');
                    }
                },
                focusInvalid: function () {
                    var invalid = document.querySelector('#co-checkout-form [aria-invalid="true"], #co-checkout-form .mage-error, #co-checkout-form .field-error');

                    if (invalid) {
                        invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                },
                setShippingInformation: function () {
                    return this.validateShippingInformation();
                }
            };

            component.errorMessage = false;

            return component;
        }

        function getShippingAddressComponent() {
            var component;

            try {
                component = registry.get('checkout.steps.shipping-step.shippingAddress') ||
                    registry.get('index = shippingAddress');
            } catch (e) {
                component = null;
            }

            if (!component) {
                component = createShippingAddressComponentFallback();
                try {
                    registry.set('fastcheckout.shippingAddress', component);
                } catch (e) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: could not register fallback shippingAddress component.', e);
                    }
                }
            }

            return component;
        }

        function createBillingAddressComponentFallback() {
            return {
                name: 'fastcheckout.billingAddress',
                index: 'billingAddress',
                isAddressSameAsShipping: ko.observable(true),
                isAddressFormVisible: ko.observable(false),
                isAddressDetailsVisible: ko.observable(true),
                errorValidationMessage: ko.observable(false),
                errorMessage: false,

                updateAddress: function () {},
                useShippingAddress: function () {
                    this.isAddressSameAsShipping(true);
                },
                editAddress: function () {
                    this.isAddressSameAsShipping(false);
                },
                cancelAddressEdit: function () {
                    this.isAddressSameAsShipping(true);
                }
            };
        }

        function getBillingAddressComponent() {
            var component;

            try {
                component = registry.get('index = billingAddress');
            } catch (e) {
                component = null;
            }

            if (!component) {
                component = createBillingAddressComponentFallback();
                try {
                    registry.set('fastcheckout.billingAddress', component);
                } catch (e) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: could not register fallback billingAddress component.', e);
                    }
                }
            }

            return component;
        }

        return {
            getShippingAddressComponent: getShippingAddressComponent,
            getBillingAddressComponent: getBillingAddressComponent
        };
    };
});
