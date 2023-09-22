define(
    [
        'jquery',
        'ko',
        'Magento_Checkout/js/model/full-screen-loader',
        'underscore',
        'Magento_Ui/js/form/form',
        'Magento_Customer/js/model/customer',
        'Magento_Customer/js/model/address-list',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/action/create-billing-address',
        'Magento_Checkout/js/action/select-billing-address',
        'Magento_Checkout/js/checkout-data',
        'Magento_Checkout/js/model/checkout-data-resolver',
        'Magento_Customer/js/customer-data',
        'Magento_Checkout/js/action/set-billing-address',
        'Magento_Ui/js/model/messageList',
        'mage/translate',
        'uiRegistry',
        'Magento_Checkout/js/model/postcode-validator',
        'Magento_Checkout/js/model/address-converter',
        'Magento_Checkout/js/action/select-shipping-address'
    ],
    function ($,
              ko,
              fullScreenLoader,
              _,
              Component,
              customer,
              addressList,
              quote,
              createBillingAddress,
              selectBillingAddress,
              checkoutData,
              checkoutDataResolver,
              customerData,
              setBillingAddressAction,
              globalMessageList,
              $t,
              registry,
              postcodeValidator,
              addressConverter,
              selectShippingAddress) {
        'use strict';

        var observedElements = [],
            setBillingActionTimeout = 0,
            inlineAddress = "",
            newAddressOption = {
                /**
                 * Get new address label
                 * @returns {String}
                 */
                getAddressInline: function () {
                    return $t('New Address');
                },
                customerAddressId: null
            },
            countryData = customerData.get('directory-data'),
            addressOptions = addressList().filter(function (address) {
                var isDublicate = inlineAddress === address.getAddressInline();
                inlineAddress = address.getAddressInline();
                return address.getType() === 'customer-address' && !isDublicate;
            });

        addressOptions.push(newAddressOption);

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/billing-address'
            },
            canHideErrors: true,
            postcodeElement: null,
            currentBillingAddress: quote.billingAddress,
            addressOptions: addressOptions,
            isCustomerLoggedIn: customer.isLoggedIn,
            customerEmail: quote.guestEmail ? quote.guestEmail : window.checkoutConfig.customerData.email,
            customerHasAddresses: addressOptions.length > 1,
            logoutUrl: quote.getLogoutUrl(),
            selectedAddress: ko.observable(null),

            quoteIsVirtual: quote.isVirtual(),
            isAddressFormVisible: ko.observable((addressList().length === 0 || (checkoutData.getSelectedBillingAddress() === 'new-customer-address' && !!checkoutData.getNewCustomerBillingAddress()))),
            isAddressSameAsShipping: ko.observable(!checkoutData.getSelectedBillingAddress()),
            saveInAddressBook: ko.observable(true),
            canUseShippingAddress: ko.computed(function () {
                return !quote.isVirtual() && quote.shippingAddress() && quote.shippingAddress().canUseForBilling();
            }),

            optionsRenderCallback: 0,
            validateAddressTimeout: 0,
            validateDelay: 1400,

            checkoutData: window.checkoutData,
            addressFields:['prefix','firstname','lastname','street','countryId','regionId','region','city','postcode','company','telephone'],

            isAddressHasError: function () {
                let self = this;

                if (self.billingStepVirtualValidate()) {
                    return false;
                }

                return true;
            },

            customerAddressesDecorateSelect: function (id) {
                let select = $('select#'+id);
                select.selectize({
                    allowEmptyOption: true,
                    onDropdownClose: function ($dropdown) {
                        $($dropdown).find('.selected').not('.active').removeClass('selected');
                    }
                });
            },


            decorateSelect: function (uid, showEmptyOption) {
                if (typeof showEmptyOption === 'undefined') { showEmptyOption = false; }
                clearTimeout(this.optionsRenderCallback);
                this.optionsRenderCallback = setTimeout(function () {
                    var select = $('#' + uid);
                    if (select.length) {
                        select.decorateSelectCustom();
                    }
                }, 0);
            },
            /**
             * Get code
             * @param {Object} parent
             * @returns {String}
             */
            getCode: function (parent) {
                return (parent && _.isFunction(parent.getCode)) ? parent.getCode() : 'shared';
            },
            getNameForSelect: function () {
                return this.name.replace(/\./g, '');
            },
            getCountryName: function (countryId) {
                return countryData()[countryId] !== undefined ? countryData()[countryId].name : '';
            },
            /**
             * @param {Object} address
             * @return {*}
             */
            addressOptionsText: function (address) {
                return address.getAddressInline();
            },

            /**
             * Init component
             */
            isVisibleManageBlock: function () {
                if(this.getAddressTypeOrder() == 'billing_first'){
                    return false;
                }
                return true;
            },

            isShippingFormFirst: function(){
                if(this.getAddressTypeOrder() == 'shipping_first'){
                    return true;
                }
                return false;
            },

            isBillingFormFirst: function(){
                if (this.isShippingFormFirst()) {
                    return false;
                }
                return true;
            },

            getAddressTypeOrder: function(){
                if (quote.isVirtual()) {
                    return 'billing_first';
                }

                if(this.checkoutData){
                    if(this.checkoutData.address_type_order && this.checkoutData.address_type_order == 'billing_first'){
                        return 'billing_first';
                    }
                }
                return 'shipping_first';
            },

            getAddressSameAsShippingFlag: function() {
                return this.isAddressSameAsShipping();
            },

            updateFocusControl: function () {
                if ($('.field .control.focus').length) {
                    $('.field .control.focus').each(function () {
                        let input = $(this).find('input');
                        if (!input.val()) {
                            if(document.activeElement.id == input.attr('id')) {
                                /* do not touch active element */
                            } else {
                                $(this).removeClass('focus');
                            }
                        }
                    });
                }
            },

            billingStepVirtualValidate: function () {
                let self = this,
                    login = self.checkoutData.login;

                self.source.set('params.invalid', false);

                if (!customer.isLoggedIn()) {
                    if (!login.validateEmail()) {
                        $("#iwd_opc_login form").validate().element("input[type='email']");
                        this.stopLoader(100);
                        return false;
                    }
                }

                self.source.trigger('billingAddressshared.data.validate');

                if (self.source.get('params.invalid')) {
                    return false;
                } else {
                    return true;
                }
            },

            initialize: function () {
                let self = this;

                this._super().observe({
                    selectedAddress: null,
                    isAddressFormVisible: (this.getAddressTypeOrder() == 'billing_first') ? true : false,
                    isAddressSameAsShipping: true,
                    saveInAddressBook: 1,
                    isAddressFormListVisible:false
                });

                self.checkoutData.billing = this;

                if (self.isBillingFormFirst() && self.customerHasAddresses) {
                    self.source.set('params.invalid', false);
                    let decorateBillingAddressList = setInterval(function () {
                        if ($('#billing_address_id').length) {
                            $('#billing_address_id').selectize({
                                allowEmptyOption: true,
                                onDropdownClose: function ($dropdown) {
                                    $($dropdown).find('.selected').not('.active').removeClass('selected');
                                }
                            });
                            clearInterval(decorateBillingAddressList);
                            self.source.set('params.invalid', false);
                        }
                    },500);
                    self.isAddressFormListVisible(true);
                }

                if (quote.isVirtual()) {
                    self.isAddressSameAsShipping(false);
                }

                quote.shippingAddress.subscribe(function (address) {
                    self.updateFocusControl();

                    if (self.isBillingFormFirst()) {
                        return true;
                    }

                    if (self.isAddressSameAsShipping()) {
                        var billingAddress = $.extend({}, address);
                        billingAddress.saveInAddressBook = 0;
                        billingAddress.save_in_address_book = 0;
                        selectBillingAddress(billingAddress);
                        var origAddress = self.source.get(self.dataScopePrefix),
                            convertedAddress = addressConverter.quoteAddressToFormAddressData(billingAddress);

                        $.each(origAddress, function(key, val) {
                            if (key === 'street') {
                                if (typeof convertedAddress[key] === 'undefined') {
                                    convertedAddress[key] = {};
                                }

                                $.each(origAddress[key], function(streetKey, streetVal) {
                                    if (typeof streetVal !== 'undefined' && typeof convertedAddress[key][streetKey] === 'undefined') {
                                        convertedAddress[key][streetKey] = '';
                                    }
                                });
                            } else if (typeof val !== 'undefined' && typeof convertedAddress[key] === 'undefined') {
                                convertedAddress[key] = '';
                            }
                        });
                        var obj = {};
                        Object.entries(convertedAddress).forEach(([key, value]) => {
                            obj[key] = value ? value : '';
                        });
                        self.source.set(self.dataScopePrefix,obj );
                    }
                });

                quote.billingAddress.subscribe(function (address) {
                    self.updateFocusControl();

                    if (quote.isVirtual()) {
                        return false;
                    }

                    let shipping = self.checkoutData.shipping,
                        dataScopePrefix = 'shippingAddress';

                    if (self.isBillingFormFirst()) {
                        if (shipping.isAddressSameAsBilling()) {
                            var shippingAddress = $.extend({}, address);
                            shippingAddress.saveInAddressBook = '0';
                            shippingAddress.save_in_address_book = '0';
                            selectShippingAddress(shippingAddress);
                            var origAddress = self.source.get(dataScopePrefix),
                                convertedAddress = addressConverter.quoteAddressToFormAddressData(shippingAddress);

                            $.each(origAddress, function(key, val) {
                                if (key === 'street') {
                                    if (typeof convertedAddress[key] === 'undefined') {
                                        convertedAddress[key] = {};
                                    }

                                    $.each(origAddress[key], function(streetKey, streetVal) {
                                        if (typeof streetVal !== 'undefined' && typeof convertedAddress[key][streetKey] === 'undefined') {
                                            convertedAddress[key][streetKey] = '';
                                        }
                                    });
                                } else if (typeof val !== 'undefined' && typeof convertedAddress[key] === 'undefined') {
                                    convertedAddress[key] = '';
                                }
                            });
                            var obj = {};
                            Object.entries(convertedAddress).forEach(([key, value]) => {
                                obj[key] = value ? value : '';
                            });
                            self.source.set(dataScopePrefix,obj );

                            let selectShippingMethod = setInterval(function () {
                                if (!$('table.table-checkout-shipping-method tbody._active').length) {
                                    if(shipping.isShippingMethodActive()){
                                        shipping.isShippingMethodActive(false);
                                        shipping.initShippingMethod();
                                    }
                                }
                            },500);

                            setTimeout(function () {
                                clearInterval(selectShippingMethod);
                            },5000)
                        }
                    }

                    if (address.customerAddressId) {
                        self.selectedAddress(address.customerAddressId);
                    } else {
                        self.selectedAddress('');
                    }
                });

                self.isAddressSameAsShipping.subscribe(function (value) {
                    self.fullFillBillingForm();
                    if (!value) {
                        $('.co-billing-form select').trigger('change');
                    }
                });

                if (addressList().length !== 0) {
                    this.selectedAddress.subscribe(function (addressId) {
                        if (!addressId) { addressId = null; }
                        if (!self.isAddressSameAsShipping()) {
                            var address = _.filter(self.addressOptions, function (address) {
                                return address.customerAddressId === addressId;
                            })[0];

                            if (quote.isVirtual()) {
                                self.isAddressFormVisible(true);
                            } else {
                                // comment for disable hide billing address while update from dropdown
                                //self.isAddressFormVisible(address === newAddressOption);
                            }

                            if (address && address.customerAddressId) {
                                self.checkoutData.address.billing = address;
                                selectBillingAddress(address);
                                checkoutData.setSelectedBillingAddress(address.getKey());
                            } else {
                                var addressData,
                                    newBillingAddress;
                                var countrySelect = $('.co-billing-form:visible').first().find('select[name="country_id"]');
                                if (countrySelect.length) {
                                    var initialVal = countrySelect.val();
                                    countrySelect.val('').trigger('change').val(initialVal).trigger('change');
                                }

                                addressData = self.source.get(self.dataScopePrefix);
                                newBillingAddress = createBillingAddress(addressData);
                                selectBillingAddress(newBillingAddress);
                                checkoutData.setSelectedBillingAddress(newBillingAddress.getKey());
                                checkoutData.setNewCustomerBillingAddress(addressData);
                            }

                            self.setBillingAddress();
                        }
                    });
                }

                if (self.isBillingFormFirst()) {
                    checkoutDataResolver.resolveBillingAddress();
                    var billingAddressCode = this.dataScopePrefix;
                    setTimeout(function () {
                        registry.async('checkoutProvider')(function (checkoutProvider) {
                            var defaultAddressData = checkoutProvider.get(billingAddressCode);

                            if (defaultAddressData === undefined) {
                                return;
                            }

                            var billingAddressData = checkoutData.getBillingAddressFromData();

                            if (billingAddressData) {
                                checkoutProvider.set(
                                    billingAddressCode,
                                    $.extend(true, {}, defaultAddressData, billingAddressData)
                                );
                            }
                            checkoutProvider.on(billingAddressCode, function (providerBillingAddressData) {
                                checkoutData.setBillingAddressFromData(providerBillingAddressData);
                            }, billingAddressCode);
                        });
                    }, 200);
                }

                if (quote.isVirtual()) {
                    checkoutDataResolver.resolveBillingAddress();
                }

                self.initFields();

                if(self.isBillingFormFirst()){
                    self.decorateBillingForm();
                }

                window.addEventListener('load', function (event) {
                    self.updateFocusControl();
                })
            },

            setBillingAddress: function () {
                clearTimeout(setBillingActionTimeout);
                setBillingActionTimeout = setTimeout(function () {
                    setBillingAddressAction(globalMessageList);
                }, 100);
            },

            decorateBillingForm: function() {
                let decorateBillingSelect = setInterval(function () {
                    if ($('#billing-new-address-form select[name="country_id"]').length && $('#billing-new-address-form select[name="region_id"]').length) {
                        $('#billing-new-address-form select[name="country_id"]').selectize({});
                        $('#billing-new-address-form select[name="region_id"]').selectize({});
                        $('#billing-new-address-form .field').each(function () {
                            if ($(this).find('input').val()) {
                                $(this).find('.control').addClass('focus');
                            }
                        });
                        clearInterval(decorateBillingSelect);
                    }
                },500);
            },

            resetBillingAddressForm: function () {
                let billingAddress = $('#billing-new-address-form');
                billingAddress.find('input').val('');
                billingAddress.find('.control.focus').removeClass('focus');
                let country_id = billingAddress.find('select[name="country_id"]');
                let region_id = billingAddress.find('select[name="region_id"]');
                country_id.selectize({})[0].selectize.clear(true);
                region_id.selectize({})[0].selectize.clear(true);
            },

            useShippingAddress: function () {
                if (!this.isAddressSameAsShipping()) {
                    this.checkoutData.infoBlock.isAddressSame(false);
                    this.resetBillingAddressForm();
                    if(addressOptions.length == 1) {
                        this.isAddressFormVisible(true);
                    } else {
                        if(this.isBillingFormFirst()){
                            this.isAddressFormListVisible(true);
                        }else{
                            this.isAddressFormVisible(true);
                        }
                    }
                    this.decorateBillingForm();
                    this.customEventListener();
                } else {
                    this.checkoutData.infoBlock.isAddressSame(true);
                    this.isAddressFormVisible(false);
                    this.isAddressFormListVisible(false);
                    checkoutData.setSelectedBillingAddress(null);
                    selectBillingAddress(quote.shippingAddress());
                }
                return true;
            },

            startLoader: function(){
                fullScreenLoader.startLoader();
            },

            stopLoader: function(timeout = 2000){
                setTimeout(function () {
                    fullScreenLoader.stopLoader();
                },timeout)
            },

            fullFillBillingForm: function () {
                let self = this;
                if (self.checkoutData.address && self.checkoutData.address.billing) {
                    let address = self.checkoutData.address.billing;
                    self.startLoader();

                    let setDataToBillingAddressFrom = setInterval(function () {
                        let form = $('#billing-new-address-form');

                        if ($('#billing-new-address-form input[name="firstname"]').length) {
                            $.each(self.addressFields, function (id,key) {
                                if (address[key]) {
                                    if (key == 'prefix' || key == 'countryId' || key == 'regionId') {
                                        let name;
                                        if (key === 'prefix') name = 'prefix';
                                        if (key === 'countryId') name = 'country_id';
                                        if (key === 'regionId') name = 'region_id';
                                        let select = form.find('select[name="'+name+'"]');

                                        if (!select.hasClass('selectized')) {
                                            if(typeof select.selectize({})[0] != 'undefined'){
                                                select.selectize({})[0].selectize.refreshOptions(false);
                                            }
                                        } else {
                                            select.selectize({})[0].selectize.refreshOptions(false);
                                        }

                                        let control = select.closest('.field')
                                        control.find('.selectize-dropdown-content .option[data-value="'+address[key]+'"]').trigger('click');

                                        control.find('.selectize-dropdown-content .option[data-value="'+address[key]+'"]').trigger('click');
                                    }else if (key === 'street') {
                                        // In case street line 2's value in the new address is empty: Remove street line 2 value
                                        // In case street line 2's value in the new address is not empty: the each below will replace the old one
                                        if (form.find('input[name="street[1]"]').length && form.find('input[name="street[1]"]').val()) {
                                            form.find('input[name="street[1]"]').val('').trigger('change');
                                        }

                                        $.each(address[key], function (number,value) {
                                            if (form.find('input[name="street['+number+']"]').length) {
                                                let control = form.find('input[name="street['+number+']"]').closest('.control');

                                                if (!control.hasClass('focus')) {
                                                    control.addClass('focus');
                                                }

                                                form.find('input[name="street['+number+']"]').val(value).trigger('change');
                                            }
                                        })
                                    }else if (form.find('input[name="'+key+'"]').length) {
                                        let control = form.find('input[name="'+key+'"]').closest('.control');

                                        if (!control.hasClass('focus')) {
                                            control.addClass('focus');
                                        }

                                        form.find('input[name="'+key+'"]').val(address[key]).trigger('change');
                                    }else if (form.find('select[name="'+key+'"]').length) {
                                        if (form.find('select[name="'+key+'"] option[value="'+address[key]+'"]').length) {
                                            form.find('select[name="'+key+'"] option[value="'+address[key]+'"]').prop('selected',true);
                                        }
                                    }
                                } else {
                                    // Optional fields:
                                    // Remove values from previous address in case values in the new address is empty
                                    if (key == 'prefix' || key == 'countryId' || key == 'regionId') {
                                        let name;
                                        let value;
                                        if (key === 'prefix') {
                                            name = 'prefix';
                                            value = ' ';
                                        } else {
                                            value = '';
                                        }
                                        if (key === 'countryId') name = 'country_id';
                                        if (key === 'regionId') name = 'region_id';
                                        let select = form.find('select[name="'+name+'"]');

                                        if (!select.hasClass('selectized')) {
                                            if(typeof select.selectize({})[0] != 'undefined'){
                                                select.selectize({})[0].selectize.refreshOptions(false);
                                            }
                                        } else {
                                            select.selectize({})[0].selectize.refreshOptions(false);
                                        }

                                        let control = select.closest('.field')
                                        control.find('.selectize-dropdown-content .option[data-value="'+value+'"]').trigger('click');
                                    } if (form.find('input[name="' + key + '"]').length) {
                                        form.find('input[name="' + key + '"]').val('').trigger('change');
                                    } else if (form.find('select[name="' + key + '"]').length) {
                                        if (form.find('select[name="' + key + '"] option[value=""]').length) {
                                            form.find('select[name="' + key + '"] option[value=""]').prop('selected', true);
                                        }
                                    }
                                }
                            })
                            clearInterval(setDataToBillingAddressFrom);
                            self.stopLoader(100);
                        }
                    },500);
                }
                self.source.set('params.invalid', false);
            },

            onAddressChange: function (addressId) {
                let self = this;
                self.startLoader();

                if (!quote.isVirtual()) {
                    if (!$('#shipping-address-same-as-billing').prop('checked')) {
                        $('#shipping-address-same-as-billing').trigger('click');
                    }
                }

                if (addressId) {
                    $.each(self.checkoutData.addressList, function (key,address) {
                        if (addressId === address.customerAddressId) {
                            self.checkoutData.address.billing = address;
                            self.fullFillBillingForm();
                        }
                    })
                }
                else {
                    self.startLoader();
                    let newBillingAddressInterval = setInterval(function () {
                        let newBillingAddress = $('#billing-new-address-form');
                        if (newBillingAddress.length) {
                            if (newBillingAddress.find('select[name="country_id"]').length && newBillingAddress.find('select[name="region_id"]').length) {

                                $.each(self.addressFields, function (id,key) {
                                    if (newBillingAddress.find('input[name="'+key+'"]').length) {
                                        newBillingAddress.find('input[name="'+key+'"]').val('').trigger('change');
                                        newBillingAddress.find('input[name="'+key+'"]').closest('.control.focus').removeClass('focus');
                                    }
                                });

                                newBillingAddress.find('input[name="street[0]"]').val('').trigger('change');
                                newBillingAddress.find('input[name="street[0]"]').closest('.control.focus').removeClass('focus');
                                newBillingAddress.find('input[name="street[1]"]').val('').trigger('change');
                                newBillingAddress.find('input[name="street[1]"]').closest('.control.focus').removeClass('focus');

                                let country_id = newBillingAddress.find('select[name="country_id"]');
                                let region_id = newBillingAddress.find('select[name="region_id"]');
                                country_id.selectize({})[0].selectize.clear(true);
                                region_id.selectize({})[0].selectize.clear(true);
                                newBillingAddress.find('.control.focus').removeClass('focus');

                                clearInterval(newBillingAddressInterval);
                                self.stopLoader(100);
                            }
                        }
                    },500);
                }
                self.source.set('params.invalid', false);
                self.stopLoader(1000);
            },

            initFields: function () {
                var self = this;
                var formPath = self.name + '.form-fields';
                var elements = [
                    'prefix',
                    'firstname',
                    'lastname',
                    'street.0',
                    'street.1',
                    'country_id',
                    'region_id',
                    'region',
                    'region_input_id',
                    'city',
                    'postcode',
                    'company',
                    'telephone',
                ];
                _.each(elements, function (element) {
                    registry.async(formPath + '.' + element)(self.bindHandler.bind(self));
                });
            },

            bindHandler: function (element) {
                var self = this;
                var delay = self.validateDelay;
                if (element.index === 'postcode') {
                    self.postcodeElement = element;
                }

                if (element.component.indexOf('/group') !== -1) {
                    $.each(element.elems(), function (index, elem) {
                        self.bindHandler(elem);
                    });
                } else {
                    element.on('value', function () {
                        clearTimeout(self.validateAddressTimeout);
                        self.validateAddressTimeout = setTimeout(function () {
                            if (!self.isAddressSameAsShipping() || self.isBillingFormFirst()) {
                                if (self.postcodeValidation()) {
                                    if (self.validateFields(false)) {
                                        self.setBillingAddress();
                                    }
                                }
                            }
                        }, delay);
                    });
                    observedElements.push(element);
                }
            },

            postcodeValidation: function () {
                var self = this;
                var countryId = $('.co-billing-form:visible').first().find('select[name="country_id"]').val(),
                    validationResult,
                    warnMessage;

                if (self.postcodeElement === null || self.postcodeElement.value() === null) {
                    return true;
                }

                self.postcodeElement.warn(null);
                validationResult = postcodeValidator.validate(self.postcodeElement.value(), countryId);

                if (!validationResult) {
                    warnMessage = $t('Provided Zip/Postal Code seems to be invalid.');

                    if (postcodeValidator.validatedPostCodeExample.length) {
                        warnMessage += $t(' Example: ') + postcodeValidator.validatedPostCodeExample.join('; ') + '. ';
                    }
                    warnMessage += $t('If you believe it is the right one you can ignore this notice.');
                    self.postcodeElement.warn(warnMessage);
                }

                return validationResult;
            },

            validateFields: function (showErrors) {
                showErrors = showErrors || false;
                var self = this;
                if (!this.isAddressFormVisible()) {
                    return true;
                }

                this.source.set('params.invalid', false);
                this.source.trigger(this.dataScopePrefix + '.data.validate');

                if (this.source.get(this.dataScopePrefix + '.custom_attributes')) {
                    this.source.trigger(this.dataScopePrefix + '.custom_attributes.data.validate');
                }

                if (!this.source.get('params.invalid')) {
                    var addressData = this.source.get(this.dataScopePrefix),
                        newBillingAddress;

                    addressData['save_in_address_book'] = this.saveInAddressBook() && !self.isAddressSameAsShipping() ? 1 : 0;
                    newBillingAddress = createBillingAddress(addressData);

                    selectBillingAddress(newBillingAddress);
                    checkoutData.setSelectedBillingAddress(newBillingAddress.getKey());
                    checkoutData.setNewCustomerBillingAddress(addressData);
                    return true;
                } else {
                    if (!showErrors && this.canHideErrors) {
                        var billingAddress = this.source.get(this.dataScopePrefix);
                        billingAddress = _.extend({
                            region_id: '',
                            region_id_input: '',
                            region: ''
                        }, billingAddress);
                        _.each(billingAddress, function (value, index) {
                            self.hideErrorForElement(value, index);
                        });
                        this.source.set('params.invalid', false);
                    }
                    return false;
                }
            },

            hideErrorForElement: function (value, index) {
                var self = this;
                if (typeof(value) === 'object') {
                    _.each(value, function (childValue, childIndex) {
                        var newIndex = (index === 'custom_attributes' ? childIndex : index + '.' + childIndex);
                        self.hideErrorForElement(childValue, newIndex);
                    })
                }

                var fieldObj = registry.get(self.name + '.form-fields.' + index);
                if (fieldObj) {
                    if (typeof (fieldObj.error) === 'function') {
                        fieldObj.error(false);
                    }
                }
            },

            collectObservedData: function () {
                var observedValues = {};

                $.each(observedElements, function (index, field) {
                    observedValues[field.dataScope] = field.value();
                });

                return observedValues;
            },

            customEventListener: function () {
                try {
                    var observer = new MutationObserver(function(mutations) {
                        mutations.forEach(function(mutationRecord) {
                            if(region_id.style.display == 'none') {
                                region.style.display = 'block';
                            } else {
                                region.style.display = 'none';
                            }
                        });
                    });

                    var region_id = document.querySelector('div[name="billingAddress.region_id"]'),
                        region = document.querySelector('div[name="billingAddress.region"]');

                    if(region_id.style.display == 'none') {
                        region.style.display = 'block';
                    } else {
                        region.style.display = 'none';
                    }

                    observer.observe(region_id, {
                        attributes: true,
                        attributeFilter: ['style']
                    });
                } catch (e) {
                    //Do nothing
                }
            },
        });
    }
);
