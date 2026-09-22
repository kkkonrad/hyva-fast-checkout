define([
    'jquery',
    'ko',
    'underscore',
    'uiRegistry',
    'Magento_Ui/js/lib/validation/validator',
    'Magento_Customer/js/model/customer',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/address-converter',
    'Magento_Checkout/js/action/select-shipping-address',
    'Magento_Checkout/js/model/shipping-service',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator'
], function ($, ko, _, registry, validator, customer, quote, converter, selectAddress, shippingService, coordinator) {
    'use strict';

    function prepareAddress(shipping) {
        var emailComponent = registry.get(shipping.name + '.customer-email'),
            email = emailComponent ? ko.unwrap(emailComponent.email) : quote.guestEmail,
            fields = [],
            address = quote.shippingAddress(),
            converted,
            changed;

        if (!address || !quote.shippingMethod() || quote.isVirtual() || shippingService.isLoading()) {
            return false;
        }

        if (!customer.isLoggedIn()) {
            if (!validator({'required-entry': true, 'validate-email': true}, email).passed) {
                return false;
            }
            quote.guestEmail = email;
        }

        if (shipping.isFormInline) {
            registry.get(function (field) {
                if (field.provider === 'checkoutProvider' &&
                    typeof field.dataScope === 'string' && field.dataScope.indexOf('shippingAddress.') === 0 &&
                    typeof field.value === 'function' && field.validation) {
                    fields.push(field);
                }
            });
            if (!fields.length || !fields.every(function (field) {
                return ko.unwrap(field.disabled) || ko.unwrap(field.visible) === false ||
                    validator(field.validation, field.value(), field.validationParams).passed;
            })) {
                return false;
            }

            converted = converter.formAddressDataToQuoteAddress(shipping.source.get('shippingAddress'));
            if (customer.isLoggedIn()) {
                converted.saveInAddressBook = 1;
            }
            // Preserve carrier extras and address methods not represented by the form.
            changed = Object.keys(converted).some(function (key) {
                return typeof converted[key] !== 'function' && converted[key] !== undefined &&
                    !_.isEqual(converted[key], address[key]);
            });
            if (changed) {
                Object.keys(converted).forEach(function (key) {
                    if (converted[key] === undefined) {
                        delete converted[key];
                    }
                });
                selectAddress($.extend({}, address, converted));
            }
        }

        return !shippingService.isLoading() && Boolean(quote.shippingMethod());
    }

    return {
        prepareAddress: prepareAddress,
        start: function (shipping) {
            var timer;

            function queueSave() {
                window.clearTimeout(timer);
                timer = window.setTimeout(function () {
                    if (prepareAddress(shipping)) {
                        coordinator.ensureSaved();
                    }
                }, 300);
            }

            shipping.source.on('shippingAddress', queueSave);
            quote.shippingMethod.subscribe(queueSave);
            quote.shippingAddress.subscribe(queueSave);
            shippingService.isLoading.subscribe(function (loading) {
                if (!loading) {
                    queueSave();
                }
            });
            registry.async(shipping.name + '.customer-email')(function (component) {
                component.email.subscribe(queueSave);
                queueSave();
            });
            queueSave();
        }
    };
});
