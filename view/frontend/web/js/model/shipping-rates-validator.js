define(
    [
        'jquery',
        'ko',
        'Magento_Checkout/js/model/shipping-rates-validation-rules',
        'Magento_Checkout/js/model/address-converter',
        'Magento_Checkout/js/action/select-shipping-address',
        'Magento_Checkout/js/model/postcode-validator',
        'mage/translate',
        'uiRegistry',
        'Magento_Checkout/js/model/quote'
    ],
    function ($,
              ko,
              shippingRatesValidationRules,
              addressConverter,
              selectShippingAddress,
              postcodeValidator,
              $t,
              uiRegistry,
              quote) {
        'use strict';

        var checkoutConfig = window.checkoutConfig,
            validators = [],
            observedElements = [],
            postcodeElement = null,
            postcodeElementName = 'postcode';

        return {
            validateAddressTimeout: 0,
            validateDelay: 100,

            /**
             * @param {String} carrier
             * @param {Object} validator
             */
            registerValidator: function (carrier, validator) {
                if (checkoutConfig.activeCarriers.indexOf(carrier) !== -1) {
                    validators.push(validator);
                }
            },

            /**
             * @param {Object} address
             * @return {Boolean}
             */
            validateAddressData: function (address) {
                return validators.some(function (validator) {
                    return validator.validate(address);
                });
            },

            /**
             * Perform postponed binding for fieldset elements
             *
             * @param {String} formPath
             */
            initFields: function (formPath) {
                var self = this,
                    elements = shippingRatesValidationRules.getObservableFields();

                if ($.inArray(postcodeElementName, elements) === -1) {
                    // Add postcode field to observables if not exist for zip code validation support
                    elements.push(postcodeElementName);
                }

                $.each(elements, function (index, field) {
                    uiRegistry.async(formPath + '.' + field)(self.doElementBinding.bind(self));
                });
            },

            /**
             * Bind shipping rates request to form element
             *
             * @param {Object} element
             * @param {Boolean} force
             * @param {Number} delay
             */
            doElementBinding: function (element, force, delay) {
                var observableFields = shippingRatesValidationRules.getObservableFields();

                if (element && (observableFields.indexOf(element.index) !== -1 || force)) {
                    if (element.index !== postcodeElementName) {
                        this.bindHandler(element, delay);
                    }
                }

                if (element.index === postcodeElementName) {
                    this.bindHandler(element, delay);
                    postcodeElement = element;
                }
            },

            /**
             * @param {*} elements
             * @param {Boolean} force
             * @param {Number} delay
             */
            bindChangeHandlers: function (elements, force, delay) {
                var self = this;

                $.each(elements, function (index, elem) {
                    self.doElementBinding(elem, force, delay);
                });
            },

            /**
             * @param {Object} element
             * @param {Number} delay
             */
            bindHandler: function (element, delay) {
                var self = this;

                delay = typeof delay === 'undefined' ? self.validateDelay : delay;

                if (element.component.indexOf('/group') !== -1) {
                    $.each(element.elems(), function (index, elem) {
                        self.bindHandler(elem);
                    });
                } else {
                    element.on('value', function () {
                        clearTimeout(self.validateAddressTimeout);
                        self.validateAddressTimeout = setTimeout(function () {
                            if (self.postcodeValidation()) {
                                self.validateFields();
                            }
                        }, delay);
                    });
                    observedElements.push(element);
                }
            },

            /**
             * @return {*}
             */
            postcodeValidation: function () {
                this.loader('start');

                var countryId = $('#co-shipping-form').find('select[name="country_id"]').val(),
                    validationResult,
                    warnMessage;

                if (postcodeElement === null || postcodeElement.value() === null) {
                    return true;
                }

                postcodeElement.warn(null);
                validationResult = postcodeValidator.validate(postcodeElement.value(), countryId);
                // postcodeElement.warn(null);

                if (!validationResult) {
                    warnMessage = $t('Provided Zip/Postal Code seems to be invalid.');

                    if (postcodeValidator.validatedPostCodeExample.length) {
                        warnMessage += $t(' Example: ') + postcodeValidator.validatedPostCodeExample.join('; ') + '. ';
                    }
                    warnMessage += $t('If you believe it is the right one you can ignore this notice.');
                    postcodeElement.warn(warnMessage);
                }

                this.loader('stop',1000);

                return validationResult;
            },

            /**
             * Convert form data to quote address and validate fields for shipping rates
             */
            validateFields: function () {
                this.loader('start');

                var addressFlat = addressConverter.formDataProviderToFlatData(
                    this.collectObservedData(),
                    'shippingAddress'
                    ),
                    address;

                if (this.validateAddressData(addressFlat) && !quote.shippingAddress().customerAddressId) {
                    addressFlat = $.extend(true, {}, quote.shippingAddress(), addressFlat);
                    address = addressConverter.formAddressDataToQuoteAddress(addressFlat);
                    selectShippingAddress(address);
                }

                this.loader('stop',1000);
            },

            /**
             * Collect observed fields data to object
             *
             * @returns {*}
             */
            collectObservedData: function () {
                var observedValues = {};

                $.each(observedElements, function (index, field) {
                    observedValues[field.dataScope] = field.value();
                });

                return observedValues;
            },

            loader: function(type, timeout = 0) {
                // if(window.fullScreenLoader) {
                //     if(typeof window.checkoutData == 'undefined'){
                //         window.checkoutData = {};
                //     }
                //
                //     setTimeout(function () {
                //         if(type == 'start') {
                //             window.checkoutData.loader = 1;
                //             window.fullScreenLoader.startLoader();
                //         } else if (type == 'stop') {
                //             window.checkoutData.loader = 0;
                //             window.fullScreenLoader.stopLoader();
                //         }
                //     }, timeout)
                // }
            },
        };
    }
);
