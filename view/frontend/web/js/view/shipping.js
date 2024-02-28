var defineArray =  [
    'jquery',
    'uiComponent',
    'Magento_Checkout/js/model/full-screen-loader',
    'underscore',
    'Magento_Ui/js/form/form',
    'ko',
    'Magento_Customer/js/model/customer',
    'Magento_Customer/js/model/address-list',
    'Magento_Checkout/js/model/address-converter',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/create-shipping-address',
    'Magento_Checkout/js/action/select-shipping-address',
    'Magento_Checkout/js/model/shipping-rates-validator',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/action/select-shipping-method',
    'Magento_Checkout/js/model/shipping-rate-registry',
    'Magento_Checkout/js/action/set-shipping-information',
    'Magento_Checkout/js/model/checkout-data-resolver',
    'Magento_Checkout/js/checkout-data',
    'Magento_Catalog/js/price-utils',
    'uiRegistry',
    'mage/translate',
    'Magento_Checkout/js/model/cart/totals-processor/default',
    'IWD_Opc/js/model/payment/is-loading',
    'Magento_Ui/js/model/messageList',
    'IWD_Opc/js/form/address-manager',
    'IWD_Opc/js/ga4Events'
];

// Use AmazonPayStorage Script if AmazonPay is enabled
var amazonPayEnabled = false;
if(typeof(window.amazonPayment) !== "undefined") {
    amazonPayEnabled = true;
    defineArray.push('Amazon_Payment/js/model/storage');
}

defineArray.push(
    'Magento_Checkout/js/model/shipping-rate-service',
    'iwdOpcHelper',
    'mage/validation'
);

defineArray.push(
    'IWD_Opc/js/view/payment',
);

define( defineArray,
    function (
              $,
              uiComponent,
              fullScreenLoader,
              _,
              Component,
              ko,
              customer,
              addressList,
              addressConverter,
              quote,
              createShippingAddress,
              selectShippingAddress,
              shippingRatesValidator,
              shippingService,
              selectShippingMethodAction,
              rateRegistry,
              setShippingInformationAction,
              checkoutDataResolver,
              checkoutData,
              priceUtils,
              registry,
              $t,
              totalsDefaultProvider,
              paymentIsLoading,
              globalMessageList,
              iwdOpcAddressManager,
              ga4Events,
              amazonStorage,
              )
        {

        amazonStorage = amazonStorage || null;

            var observedElements = [],
                setShippingActionTimeout = 0,
            inlineAddress = "",
            newAddressOption = {
            getAddressInline: function () {
                return $t('New Address');
            },
            customerAddressId: null
        }, addressOptions = addressList().filter(function (address) {
            var isDublicate = inlineAddress === address.getAddressInline();
                inlineAddress = address.getAddressInline();
            return address.getType() === 'customer-address' && !isDublicate;
        });
        addressOptions.push(newAddressOption);

        var setShippingInformationTimeout = null,
            getTotalsTimeout = null,
            instance = null,
            totalsProcessors = [];

        window.fullScreenLoader = fullScreenLoader;

        var defaults = {};
        defaults.template = 'IWD_Opc/shipping';
        defaults.shippingMethodItemTemplate = 'IWD_Opc/shipping-address/custom-shipping-list';
        defaults.shippingMethodActiveItemTemplate = 'IWD_Opc/shipping-address/custom-shipping-list-active';
        defaults.isShippingMethodActive = function (method) {
            let code = method.carrier_code + '_' + method.method_code;
            if(window.checkoutData && window.checkoutData.shippingMethodCode) {
                if(code == window.checkoutData.shippingMethodCode) {
                    return true;
                }
            }

            return false;
        };

        return Component.extend({
            defaults,
            canHideErrors: true,
            isCustomerLoggedIn: customer.isLoggedIn,
            customerHasAddresses: addressOptions.length > 1,
            logoutUrl: quote.getLogoutUrl(),
            isAddressFormVisible: ko.observable(addressList().length === 0),
            saveInAddressBook: 1,
            addressOptions: addressOptions,
            selectedAddress: ko.observable(),
            displayAllMethods: window.checkoutConfig.iwdOpcSettings.displayAllMethods,
            specificMethodsForDisplayAllMethods: ['iwdstorepickup'],
            isAmazonAccountLoggedIn: amazonStorage.isAmazonAccountLoggedIn,

            errorValidationMessage: ko.observable(false),
            quoteIsVirtual: quote.isVirtual(),

            isShowGiftMessage: quote.isShowGiftMessage(),
            isShowDelimiterAfterShippingMethods: quote.isShowComment() || quote.isShowGiftMessage(),
            isShowComment: quote.isShowComment(),
            commentValue: ko.observable(checkoutData.getComment()),


            rateBuilding: ko.observable(false),
            shippingRateGroups: ko.observableArray([]),
            shippingRates: ko.observableArray([]),
            shippingRate: ko.observable(),
            shippingRateGroup: ko.observable(),
            rates: shippingService.getShippingRates(),
            shippingRateGroupsCaption: ko.observable(null),
            shippingRatesCaption: ko.observable(null),
            isShippingRatesVisible: ko.observable(false),

            isRatesLoading: shippingService.isLoading,

            isFormInline: addressList().length === 0,
            shippingMethod: 'table.table-checkout-shipping-method tbody',

            checkoutData: window.checkoutData,

            customerEmail: quote.guestEmail ? quote.guestEmail : window.checkoutConfig.customerData.email,
            validateDelay: 1400,
            validateAddressTimeout: 0,

            addressFields:['prefix','firstname','lastname','street','countryId','regionId','region','city','postcode','company','telephone'],


            setShippingAddress: function () {
                clearTimeout(setShippingActionTimeout);
                setShippingActionTimeout = setTimeout(function () {
                    setShippingInformationAction(globalMessageList);
                }, 100);
            },
            resetShippingAddressForm: function () {
                let shippingAddress = $('#shipping-new-address-form');
                shippingAddress.find('.field').removeClass('_error');
                shippingAddress.find('input').val('');
                shippingAddress.find('.control').removeClass('focus');
                let country_id = shippingAddress.find('select[name="country_id"]');
                let region_id = shippingAddress.find('select[name="region_id"]');
                if(region_id.data('selectize')) region_id.selectize({})[0].selectize.clear(true);
                if(country_id.data('selectize')) country_id.selectize({})[0].selectize.clear(true);
            },

            useBillingAddress: function() {
                if(this.isAddressShippingFormVisible()) {
                    this.checkoutData.infoBlock.isAddressSame(true);
                    this.isAddressShippingFormVisible(false);
                } else {
                    this.resetShippingAddressForm();
                    this.checkoutData.infoBlock.isAddressSame(false);
                    this.isAddressShippingFormVisible(true);
                }

                return true;
            },

            manageDeliveryComment: function() {
                if(this.isCommentVisible()) {
                    this.isCommentVisible(false);
                } else {
                    this.isCommentVisible(true);
                }
                return true;
            },

            goToShoppingCart: function() {
                this.startLoader();
                ga4Events.editCartEvent();
                window.location.href = window.location.origin + '/checkout/cart/';
            },

            goToAddressStep: function() {
                let self = this,
                    summary = self.checkoutData.summary,
                    payment = self.checkoutData.payment;

                self.startLoader();
                self.CurrentStep(1);
                self.updateBreadcrumbs('address');
                summary.updateSummaryWrapperTopHeight(0);
                self.AddressStep(true);
                self.DeliveryStep(false);
                payment.PaymentStep(false);
                self.stopLoader(500);
                return true;
            },

            goToDeliveryStep: function(type = 'multistep') {
                let self = this,
                    summary = self.checkoutData.summary,
                    isAddressMultiple = true,
                    billing = self.checkoutData.billing,
                    login = self.checkoutData.login,
                    payment = self.checkoutData.payment,
                    addressFormValid = true;

                self.startLoader();
                self.source.set('params.invalid', false);

                if(self.CurrentStep() == 3 && self.isMultiStepResolution()) {
                    summary.updateSummaryWrapperTopHeight(0);
                    self.AddressStep(false);
                    self.DeliveryStep(true);
                    payment.PaymentStep(false);
                    self.CurrentStep(2);
                    self.updateBreadcrumbs('delivery');
                    self.stopLoader(1000);
                    return;
                }

                if (!customer.isLoggedIn()) {
                    if (!login.validateEmail()) {
                        $("#iwd_opc_login form").validate().element("input[type='email']");
                        this.stopLoader(100);
                        addressFormValid = false;
                    }
                }

                if (self.isBillingFormFirst()) {
                    isAddressMultiple = self.isAddressSameAsBilling();

                    if(isAddressMultiple){
                        self.source.trigger('billingAddress.data.validate');
                        iwdOpcAddressManager.billingAddressValidation();
                    }

                } else {
                    isAddressMultiple = self.checkoutData.billing.isAddressSameAsShipping();

                    if (isAddressMultiple) {
                        self.source.trigger('shippingAddress.data.validate');
                        iwdOpcAddressManager.shippingAddressValidation();
                    }
                }

                if (!isAddressMultiple) {
                    self.source.trigger('billingAddress.data.clearError');
                    self.source.trigger('shippingAddress.data.clearError');
                    self.source.set('params.invalid', false);
                    self.source.trigger('billingAddress.data.validate');
                    self.source.trigger('shippingAddress.data.validate');
                    iwdOpcAddressManager.addressValidation();
                }

                if (self.source.get('params.invalid')) {
                    this.stopLoader(100);
                    addressFormValid = false;
                }

                if(!addressFormValid) return false;

                if (type === 'onepage') {
                    this.stopLoader(100);
                    return true;
                }

                summary.updateSummaryWrapperTopHeight(0);
                self.AddressStep(false);
                self.DeliveryStep(true);
                payment.PaymentStep(false);

                self.CurrentStep(2);
                self.updateBreadcrumbs('delivery');
                this.stopLoader(500);

                return true;
            },

            goToPaymentStep: function() {
                let self = this;

                self.startLoader();

                if(self.isMultiStepResolution()) {
                    if(self.isAddressHasError()) {
                        self.stopLoader(500);
                        return false;
                    }
                }

                let shippingMethodForm = $('#co-shipping-method-form');
                shippingMethodForm.validate({
                    errorClass: 'mage-error',
                    errorElement: 'div',
                    meta: 'validate'
                });

                shippingMethodForm.validation();

                if (!shippingMethodForm.validation('isValid') || !quote.shippingMethod()) {
                    self.stopLoader(500);
                    return false;
                } else {

                    self.AddressStep(false);
                    self.DeliveryStep(false);
                    self.checkoutData.payment.PaymentStep(true);
                }

                self.CurrentStep(3);

                self.updateBreadcrumbs('pay');
                self.stopLoader(500);

                return true;
            },

            isAddressHasError: function () {
                let self = this;

                // if payment step and layout = MultiStep we can skip this validation
                if(self.CurrentStep() == 3 && self.isMultiStepResolution()) {
                    return false;
                }

                // if delivery step available, address doesn't have errors
                if (self.goToDeliveryStep('onepage')) {
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

            fullFillShippingForm: function (addressType) {
                let self = this;

                // self.source.trigger('shippingAddress.data.clearError');
                // self.source.set('params.invalid', false);

                if (self.checkoutData.address) {
                    let address = self.checkoutData.address;

                    if (addressType == 'billing') {
                        if(address.billing){
                            address = address.billing;
                        }
                    } else {
                        if (address.shipping) {
                            address = address.shipping;
                            self.isAddressFormVisible(true);
                        } else {
                            if (quote.shippingAddress()) {
                                address = quote.shippingAddress();
                                self.isAddressFormVisible(true);
                            }
                        }
                    }

                    self.startLoader();

                    let setDataToShippingAddressFrom = setInterval(function () {
                        let form = $('#co-shipping-form');

                        if ($('#co-shipping-form input[name="firstname"]').length) {
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
                                    } else if (key === 'street') {
                                        // In case street line 2's value in the new address is empty: Remove street line 2 value
                                        // In case street line 2's value in the new address is not empty: the each below will replace the old one
                                        if (form.find('input[name="street[1]"]').length && form.find('input[name="street[1]"]').val()) {
                                            form.find('input[name="street[1]"]').val('').trigger('change');
                                        }

                                        $.each(address[key], function (number,value) {
                                            if (form.find('input[name="street['+number+']"]').length) {
                                                let control = form.find('input[name="street['+number+']"]').closest('.control');

                                                if (value && !control.hasClass('focus')) {
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
                                    } else if (form.find('input[name="' + key + '"]').length) {
                                        let customerData = customer.customerData, val = '';
                                        if((key === 'firstname' || key === 'lastname') && customerData[key]) val = customerData[key];

                                        form.find('input[name="' + key + '"]').val(val).trigger('change');
                                        self.toggleInput(form.find('input[name="' + key + '"]'));

                                    } else if (form.find('select[name="' + key + '"]').length) {
                                        if (form.find('select[name="' + key + '"] option[value=""]').length) {
                                            form.find('select[name="' + key + '"] option[value=""]').prop('selected', true);
                                        }
                                    }
                                }
                            })
                            clearInterval(setDataToShippingAddressFrom);
                            self.stopLoader(100);
                        }
                    },500);
                }
                //self.source.set('params.invalid', false);
            },

            onAddressChange: function (addressId) {
                let self = this;
                self.startLoader();
                // comment for disable click while change existing shipping address while selected different billing address
               /* if ($('#billing-address-same-as-shipping').prop('checked') == true) {
                    $('#billing-address-same-as-shipping').trigger('click');
                }
*/
                if (addressId) {
                    $.each(self.checkoutData.addressList, function (key,address) {
                        if (addressId === address.customerAddressId) {
                            self.checkoutData.address.shipping = address;
                            self.fullFillShippingForm('shipping');
                        }
                    })
                }
                else {
                    let newShippingAddressInterval = setInterval(function () {
                        let newShippingAddress = $('#co-shipping-form');
                        if (newShippingAddress.length) {
                            let country_id = newShippingAddress.find('select[name="country_id"]'),
                                region_id = newShippingAddress.find('select[name="region_id"]');
                            if (country_id.length && region_id.length) {
                                newShippingAddress.find('.field').removeClass('_error');
                                newShippingAddress.validate().resetForm();
                                newShippingAddress.trigger("reset");
                                region_id.selectize({})[0].selectize.clear(true);
                                country_id.selectize({})[0].selectize.clear(true);
                                newShippingAddress.find('.control').removeClass('focus');
                                if(customer.isLoggedIn()) {
                                    iwdOpcAddressManager.setCustomerData(newShippingAddress, customer);
                                }
                                clearInterval(newShippingAddressInterval);
                            }
                        }
                    },500);
                }
                self.source.set('params.invalid', false);

                if(addressId) {
                    self.reSelectShippingMethod();
                } else {
                    rateRegistry.set('new-customer-address', null);
                    rateRegistry.set('new-customer-address' + Date.now(), null);
                    shippingService.setShippingRates([]);
                }

                self.stopLoader(1000);
            },

            getAddressSameAsBillingFlag: function () {
                return this.isAddressSameAsBilling();
            },

            screenResize: function () {
                let self = this;

                window.addEventListener('resize', function (e) {
                    self.multiStepEventListener();
                });
            },

            multiStepEventListener: function () {
                let self = this,
                    screenWidth = window.innerWidth;

                if (screenWidth > 991) {
                    self.updateMultiStepResolution(self.isDesktopMultiResolution());
                } else if (screenWidth <= 991 && screenWidth > 575) {
                    self.updateMultiStepResolution(self.isTabletMultiResolution());
                } else {
                    self.updateMultiStepResolution(self.isMobileMultiResolution());
                }
            },

            updateMultiStepResolution: function (resolution) {
                let self = this,
                    payment = self.checkoutData.payment;

                if (self.AddressStep()) {
                    self.CurrentStep(1);
                } else if (self.DeliveryStep()) {
                    self.CurrentStep(2);
                } else {
                    self.CurrentStep(3);
                }

                if (resolution == 'multistep') {
                    self.isMultiStepResolution(true);
                    payment.isMultiStepResolution(true);

                    if (self.CurrentStep() == 1) {
                        self.AddressStep(true);
                        self.DeliveryStep(false);
                        payment.PaymentStep(false);
                    } else if (self.CurrentStep() == 2) {
                        self.AddressStep(false);
                        self.DeliveryStep(true);
                        payment.PaymentStep(false);
                    } else {
                        self.AddressStep(false);
                        self.DeliveryStep(false);
                        payment.PaymentStep(true);
                    }

                } else {
                    self.isMultiStepResolution(false);
                    payment.isMultiStepResolution(false);
                    self.AddressStep(true);
                    self.DeliveryStep(true);
                    payment.PaymentStep(true);
                }

                return true;
            },

            isEmpty: function (value) {
                return (!value || value.length === 0);
            },

            autoFill: function () {
                let self = this;

                $(document).on('blur','input',function (){
                    if (!self.isEmpty($(this).val())) {
                        if($(this).attr('name') !== 'shipping-country-id'
                            && $(this).attr('name') !== 'shipping-region-id'
                            && $(this).attr('name') !== 'billing-country-id'
                            && $(this).attr('name') !== 'billing-region-id') {
                            $(this).closest('.control').addClass('focus');
                        }
                    }
                });
            },

            toggleInput: function (input) {
                if (!this.isEmpty(input.val())) {
                    input.closest('.control').addClass('focus');
                } else {
                    input.closest('.control').removeClass('focus');
                }
            },

            initialize: function () {
                let self = this,
                    fieldsetName = 'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset',
                    screenWidth = window.innerWidth;

                this._super().observe({
                    isAddressShippingFormVisible: false,
                    isAddressSameAsBilling: true,
                    isCommentVisible: false,
                    CurrentStep: ko.observable(1),
                    AddressStep: ko.observable(true),
                    DeliveryStep: ko.observable(false),
                    isMultiStepResolution: (screenWidth > 991 && self.checkoutData.layout.desktop == 'multistep') ? ko.observable(true) :
                                           (screenWidth <= 991 && screenWidth > 575 && self.checkoutData.layout.tablet == 'multistep') ? ko.observable(true) :
                                           (screenWidth <= 575 && self.checkoutData.layout.mobile == 'multistep') ? ko.observable(true) : ko.observable(false),
                    isDesktopMultiResolution: ko.observable(self.checkoutData.layout.desktop),
                    isTabletMultiResolution: ko.observable(self.checkoutData.layout.tablet),
                    isMobileMultiResolution: ko.observable(self.checkoutData.layout.mobile),
                    isShippingMethodActive: ko.observable(false),
                });

                this.checkoutData.shipping = this;

                let summary = self.checkoutData.summary;

                // self.isDesktopMultiResolution(self.checkoutData.layout.desktop);
                // self.isTabletMultiResolution(self.checkoutData.layout.tablet);
                // self.isMobileMultiResolution(self.checkoutData.layout.mobile);

                self.AddressStep.subscribe(function (AddressStep) {
                    summary.updateSummaryWrapperTopHeight(0);
                });

                self.DeliveryStep.subscribe(function (DeliveryStep) {
                    summary.updateSummaryWrapperTopHeight(0);
                });

                instance = this;

                self.initAddressFields();

                shippingRatesValidator.initFields(fieldsetName);
                checkoutDataResolver.resolveShippingAddress();
                registry.async('checkoutProvider')(function (checkoutProvider) {
                    var shippingAddressData = checkoutData.getShippingAddressFromData();

                    if(!customer.isLoggedIn() || !window.checkoutData.addressList) {
                        shippingAddressData = {};
                    }

                    if (shippingAddressData) {
                        checkoutProvider.set(
                            'shippingAddress',
                            $.extend({}, checkoutProvider.get('shippingAddress'), shippingAddressData)
                        );
                    }

                    checkoutProvider.on('shippingAddress', function (shippingAddressData) {
                        checkoutData.setShippingAddressFromData(shippingAddressData);
                    });
                });

                totalsProcessors['default'] = totalsDefaultProvider;

                if (addressList().length !== 0) {
                    self.checkoutData.addressList = addressList();
                    this.selectedAddress.subscribe(function (addressId) {
                        if (typeof addressId === 'undefined' || addressId === '') { addressId = null; }
                        let shippingAddressListValue = $('#shipping_address_id').val();
                        if (typeof addressId == 'object' && shippingAddressListValue !== "") {
                            addressId = shippingAddressListValue;
                        }
                        var address = _.filter(self.addressOptions, function (address) {
                            return address.customerAddressId === addressId;
                        })[0];
                        self.isAddressFormVisible(address === newAddressOption);
                        if (address && address.customerAddressId) {
                            self.checkoutData.address.shipping = address;

                            if (quote.shippingAddress() && quote.shippingAddress().getKey() === address.getKey()) {
                                return;
                            }

                            selectShippingAddress(address);
                            checkoutData.setSelectedShippingAddress(address.getKey());
                        } else {
                            if (!document.activeElement.classList.contains('iwd_opc_place_order_button')
                                && !window.IWDStartPlacingOrder) {
                                self.resetShippingAddressForm();
                            }
                            var addressData,
                                newShippingAddress;
                            addressData = self.source.get('shippingAddress');
                            //addressData.save_in_address_book = self.saveInAddressBook ? 1 : 0;
                            if(addressData.save_in_address_book !== 1 && addressData.save_in_address_book !== 0) {
                                addressData.save_in_address_book = self.saveInAddressBook ? 1 : 0;
                            }
                            newShippingAddress = addressConverter.formAddressDataToQuoteAddress(addressData);
                            selectShippingAddress(newShippingAddress);
                            checkoutData.setSelectedShippingAddress(newShippingAddress.getKey());
                            checkoutData.setNewCustomerShippingAddress(addressData);
                        }
                    });

                    if (quote.shippingAddress()) {
                        this.selectedAddress(quote.shippingAddress().customerAddressId);
                    }
                }

                this.commentValue.subscribe(function (value) {
                    checkoutData.setComment(value);
                });

                quote.shippingAddress.subscribe(function (shippingAddress) {
                    self.reSelectShippingMethod(1000);
                });

                quote.shippingMethod.subscribe(function (shippingMethod) {
                    if(shippingMethod && window.checkoutData && window.checkoutData.shippingMethodCode) {
                        let shippingMethodCode = shippingMethod.carrier_code + '_' + shippingMethod.method_code,
                            shippingAmount = parseFloat(shippingMethod.amount).toFixed(2),
                            currentShippingMethodCode = window.checkoutData.shippingMethodCode,
                            currentShippingAmount = parseFloat(window.checkoutData.totalsData.shipping_amount).toFixed(2);

                        if(shippingMethodCode === currentShippingMethodCode && shippingAmount === currentShippingAmount) return;
                    }

                    if(shippingMethod) window.checkoutData.totalsData.shipping_amount = parseFloat(shippingMethod.amount).toFixed(2);

                    totalsDefaultProvider.estimateTotals(quote.shippingAddress());
                    self.reSelectShippingMethod(1000);
                });

                this.rates.subscribe(function (rates) {
                    if(quote.shippingAddress().getKey() == 'new-customer-address' && !iwdOpcAddressManager.isNewCustomerAddressValid()) {
                        return true;
                    }

                    self.rateBuilding(true);
                    self.shippingRateGroups([]);
                    if (rates.length > 1) {
                        self.shippingRateGroupsCaption('');
                    } else {
                        self.shippingRateGroupsCaption(null);
                    }

                    _.each(rates, function (rate) {
                        if (rate) {
                            var carrierTitle = self.formatCarrierTitle(rate);
                            if (rate.error_message || !rate.method_code) {
                                self.rates.remove(rate);
                            }

                            if (self.shippingRateGroups.indexOf(carrierTitle) === -1) {
                                self.shippingRateGroups.push(carrierTitle);
                            }
                        }
                    });
                    self.rateBuilding(false);
                });

                this.shippingRateGroup.subscribe(function (carrierTitle) {
                    if (carrierTitle === '') {
                        return;
                    }

                    self.shippingRates([]);
                    var ratesByGroup = _.filter(self.rates(), function (rate) {
                        return carrierTitle === self.formatCarrierTitle(rate);
                    });

                    if (ratesByGroup.length === 0) {
                        self.selectShippingMethod('');
                    }

                    if (ratesByGroup.length > 1) {
                        self.shippingRatesCaption('');
                    } else {
                        self.shippingRatesCaption(null);
                    }

                    var $selectize = $('#iwd_opc_shipping_method_rates');

                    $selectize = $selectize.length
                        ? $selectize[0].selectize
                        : false;

                    if ($selectize) {
                        $selectize.loadedSearches = {};
                        $selectize.userOptions = {};
                        $selectize.renderCache = {};
                        $selectize.options = $selectize.sifter.items = {};
                        $selectize.lastQuery = null;
                        $selectize.updateOriginalInput({silent: true});
                    }

                    _.each(ratesByGroup, function (rate) {
                        if (self.shippingRates.indexOf(rate) === -1) {
                            rate = self.formatShippingRatePrice(rate);
                            self.shippingRates.push(rate);

                            if (rate.available && $selectize) {
                                $selectize.addOption({text: self.shippingRateTitle(rate), value: rate.carrier_code + '_' + rate.method_code})
                            }
                        }
                    });

                    if ($selectize) {
                        $selectize.refreshOptions(false);
                        $selectize.refreshItems();

                        if (ratesByGroup.length) {
                            $selectize.addItem(ratesByGroup[0].carrier_code + '_' + ratesByGroup[0].method_code);
                        }
                    }
                });

                this.shippingRates.subscribe(function (rate) {
                    var minLength = (self.displayAllMethods) ? 1 : 0;

                    if (self.shippingRates().length > minLength) {
                        self.isShippingRatesVisible(true);
                    } else {
                        self.isShippingRatesVisible(false);
                    }
                });

                self.multiStepEventListener();
                self.screenResize();
                self.initCheckoutData();

                if (!$('table.table-checkout-shipping-method tbody._active').length) {
                    self.initShippingMethod();
                }

                self.changeShippingMethod();
                self.autoFill();
                self.newAddressHandler();

                return this;
            },

            initCheckoutData:function(){
                if(typeof this.checkoutData != 'object'){
                    this.checkoutData = {}
                }
            },

            isShippingFormFirst: function() {
                if (this.getAddressTypeOrder() == 'shipping_first') {
                    return true;
                }

                return false;
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

            getDesignResolution: function(design){
                return this.checkoutData.layout.design;
            },

            setDesignResolution: function() {
                let self = this;

                if (self.isMultiStepResolution()) {
                    this.DeliveryStep(false);
                    this.checkoutData.payment.PaymentStep(false);
                    this.isMultiStepResolution(true);
                    this.checkoutData.payment.isMultiStepResolution(true);
                } else {
                    this.DeliveryStep(true);
                    this.checkoutData.payment.PaymentStep(true);
                    this.isMultiStepResolution(false);
                    this.checkoutData.payment.isMultiStepResolution(false);
                }

                if(this.checkoutData.shippingAddressFromData){
                    var shippingAddressFromData = setInterval(function () {
                        if ($('#co-shipping-form input[name="firstname"]').length) {
                            $.each(this.checkoutData.shippingAddressFromData,function (key,value) {
                                if(key == 'street'){
                                    $.each(value,function (number,address) {
                                        if(address && address.length){
                                            if($('#co-shipping-form input[name="street['+number +']"]').length){
                                                $('#co-shipping-form input[name="street['+number +']"]').closest('.control').addClass('focus');
                                            }
                                        }
                                    });
                                }else if(value && value.length){
                                    if($('#co-shipping-form input[name="'+key+'"]').length){
                                        $('input[name="'+key+'"]').closest('.control').addClass('focus');
                                    }
                                }
                            });

                            clearInterval(shippingAddressFromData);
                        }
                    }, 500);
                }

                if(this.checkoutData.billingAddressFormData){

                }

                return true;
            },

            isShippingFormFirst: function() {
                let self = this;

                if (self.getAddressTypeOrder() == 'shipping_first') {
                    return true;
                }

                return false;
            },

            isBillingFormFirst: function() {
                if (this.isShippingFormFirst()) {
                    return false;
                }

                this.decorateBillingSelect();

                return true;
            },

            decorateBillingSelect:function(){
                var decorateBillingSelect = setInterval(function () {
                    var region_id = $('#billing-new-address-form select[name="region_id"]'),
                        country_id = $('#billing-new-address-form select[name="country_id"]');

                    if (region_id.length) {
                        region_id.serialize({});
                    }

                    if (country_id.length) {
                        country_id.serialize({});
                    }

                    if (region_id.length && country_id.length) {
                        clearInterval(decorateBillingSelect);
                    }
                }, 500);
            },

            startLoader: function() {
                window.checkoutData.loader = 1;
                fullScreenLoader.startLoader();
            },

            stopLoader: function(timeout = 2000) {
                setTimeout(function () {
                    window.checkoutData.loader = 0;
                    fullScreenLoader.stopLoader();
                },timeout)
            },

            changeShippingMethod:function() {
                let self = this;

                $(document).on('click',self.shippingMethod,function (event) {
                    self.startLoader();
                    $(self.shippingMethod).removeClass('_active');
                    $(this).addClass('_active');
                    $(self.shippingMethod).find('input[type="radio"]').prop('checked',false);

                    let shippingMethod = $(this).find('input[type="radio"]');
                    shippingMethod.prop('checked',true);

                    ga4Events.changeShippingMethod(shippingMethod.data('title'));

                    if(self.checkoutData.shippingMethodCode && self.checkoutData.shippingMethodCode === shippingMethod.val()){
                        self.stopLoader();
                        return false;
                    }  else {
                        self.selectCurrentShippingMethod(shippingMethod.attr('name'));
                        self.stopLoader();
                    }
                })
            },

            selectCurrentShippingMethod: function(name){
                let self = this;

                self.checkoutData.shippingMethodCode = $('input[name="'+name+'"]').val();
                $('input[name="'+name+'"]').click();
            },

            initShippingMethod: function(){
                let self = this;

                let initShippingMethod = setInterval(function () {
                    if($(self.shippingMethod).length) {
                        let shipping = self.checkoutData.default.shipping;
                        let shippingMethod = $(self.shippingMethod).eq(0).find('input[type="radio"]');
                        if(shipping){
                            shippingMethod = $(self.shippingMethod).find('input[value="'+shipping+'"]');
                        }
                        if (shippingMethod.length) {
                            shippingMethod.trigger('click');
                        }
                    }
                },500);
                setTimeout(function () {
                    clearInterval(initShippingMethod);
                },5000)
            },

            optionsRenderCallback: [],

            decorateSelect: function (uid) {
                if (typeof(this.optionsRenderCallback[uid]) !== 'undefined') {
                    clearTimeout(this.optionsRenderCallback[uid]);
                }

                this.optionsRenderCallback[uid] = setTimeout(function () {
                    var select = $('#' + uid);
                    if (select.length) {
                        select.decorateSelectCustom();
                    }
                }, 0);
            },

            formatShippingRatePrice: function (rate) {
                if (rate.price_excl_tax !== 0 && rate.price_incl_tax !== 0) {
                    if (window.checkoutConfig.isDisplayShippingBothPrices && (rate.price_excl_tax !== rate.price_incl_tax)) {
                        rate.formatted_price = priceUtils.formatPrice(rate.price_excl_tax, quote.getPriceFormat());
                        rate.formatted_price += ' (' + $t('Incl. Tax') + ' ' + priceUtils.formatPrice(rate.price_incl_tax, quote.getPriceFormat()) + ')';
                    } else {
                        if (window.checkoutConfig.isDisplayShippingPriceExclTax) {
                            rate.formatted_price = priceUtils.formatPrice(rate.price_excl_tax, quote.getPriceFormat());
                        } else {
                            rate.formatted_price = priceUtils.formatPrice(rate.price_incl_tax, quote.getPriceFormat());
                        }
                    }
                }

                return rate;
            },

            setShippingInformation: function () {
                if (this.validateShippingInformation()) {
                    var shippingAddress = quote.shippingAddress();
                    var billingAddress = quote.billingAddress(),
                        amazonAccountLoggedIn = false;

                    if (amazonPayEnabled) {
                        if (amazonStorage.isAmazonAccountLoggedIn()) {
                            amazonAccountLoggedIn = true;
                        }
                    }

                    if (!amazonAccountLoggedIn) {
                        if (this.isAddressFormVisible()) {
                            var shippingAddress,
                                addressData;
                            addressData = addressConverter.formAddressDataToQuoteAddress(
                                this.source.get('shippingAddress')
                            );

                            for (var field in addressData) {
                                if (addressData.hasOwnProperty(field) &&
                                    shippingAddress.hasOwnProperty(field) &&
                                    typeof addressData[field] !== 'function' &&
                                    _.isEqual(shippingAddress[field], addressData[field])
                                ) {
                                    shippingAddress[field] = addressData[field];
                                } else if (typeof addressData[field] !== 'function' &&
                                    !_.isEqual(shippingAddress[field], addressData[field])) {
                                    shippingAddress = addressData;
                                    break;
                                }
                            }

                            if (!window.checkoutData.addressList) {
                                shippingAddress.save_in_address_book = this.saveInAddressBook ? 1 : 0;
                            }

                            checkoutData.setNeedEstimateShippingRates(false);
                            selectShippingAddress(shippingAddress);
                            if (customer.isLoggedIn()) {
                                checkoutData.setNewCustomerShippingAddress(shippingAddress);
                            }

                            checkoutData.setNeedEstimateShippingRates(true);
                        }
                    } else {
                        if (!customer.isLoggedIn()) {
                            shippingAddress.save_in_address_book = 1;
                            billingAddress.save_in_address_book = 1;
                        }
                    }

                    if (quote.shippingMethod()) {
                        paymentIsLoading.isLoading(true);
                        return setShippingInformationAction().always(function () {
                            paymentIsLoading.isLoading(false);
                        });
                    } else {
                        return $.Deferred();
                    }
                }
            },

            textareaAutoSize: function (element) {
                $(element).textareaAutoSize();
            },

            shippingRateTitle: function (rate) {
                var title = '';
                if (rate) {
                    if (rate.formatted_price) {
                        title += rate.formatted_price + ' - ';
                    }
                }

                title += rate.method_title;

                return title;
            },

            shippingRateTitleFull: function(rate) {
                var title = this.shippingRateTitle(rate);
                if (rate.carrier_title) {
                    title += ': ' + rate.carrier_title;
                }

                return title;
            },

            formatCarrierTitle: function (rate) {
                var carrierTitle = rate['carrier_title'];

                if (this.displayAllMethods && this.specificMethodsForDisplayAllMethods.indexOf(rate.carrier_code)) {
                    rate = this.formatShippingRatePrice(rate);
                    carrierTitle = this.shippingRateTitleFull(rate);
                }

                return carrierTitle
            },

            addressOptionsText: function (address) {
                return address.getAddressInline();
            },

            selectShippingMethod: function (shippingMethod, shippingRates) {
                selectShippingMethodAction(shippingMethod);
                checkoutData.setSelectedShippingRate(shippingMethod['carrier_code'] + '_' + shippingMethod['method_code']);
                return true;
            },

            validateShippingInformation: function (showErrors) {
                var loginFormSelector = 'form[data-role=email-with-possible-login]',
                    self = this,
                    emailValidationResult = customer.isLoggedIn(),
                    shippingMethodValidationResult = true;

                if (!quote.shippingMethod()) {
                    this.errorValidationMessage(
                        $t('The shipping method is missing. Select the shipping method and try again.')
                    );

                    $('html, body').animate({
                        scrollTop: $('.iwd_opc_alternative_step.delivery').offset().top
                    }, 600);

                    return false;
                }

                if(amazonPayEnabled) {
                    if (amazonStorage.isAmazonAccountLoggedIn()) {
                        if(!customer.isLoggedIn() && $(loginFormSelector).length) {
                            $(loginFormSelector).validation();
                            return Boolean($(loginFormSelector + ' input[name=username]').valid());
                        } else {
                            return true;
                        }
                    }
                }
                if (this.isFormInline) {
                    if (!quote.shippingMethod()['method_code']) {
                        this.errorValidationMessage(
                            $t('The shipping method is missing. Select the shipping method and try again.')
                        );
                    }
                }

                showErrors = showErrors || false;
                var shippingMethodForm = $('#co-shipping-method-form'),
                    shippingMethodSelectors = shippingMethodForm.find('.select');
                shippingMethodSelectors.removeClass('mage-error');
                shippingMethodForm.validate({
                    errorClass: 'mage-error',
                    errorElement: 'div',
                    meta: 'validate'
                });
                shippingMethodForm.validation();
                //additional validation for non-selected shippingMethod
                if(showErrors && !quote.shippingMethod()) {
                    shippingMethodSelectors.addClass('mage-error');
                }

                if (!shippingMethodForm.validation('isValid') || !quote.shippingMethod()) {
                    if (!showErrors && this.canHideErrors && shippingMethodForm.length) {
                        shippingMethodForm.validate().resetForm();
                    }

                    shippingMethodValidationResult = false;
                }

                if (!customer.isLoggedIn() && $(loginFormSelector).length) {
                    $(loginFormSelector).validation();
                    emailValidationResult = Boolean($(loginFormSelector + ' input[name=username]').valid());
                    if (!showErrors && this.canHideErrors) {
                        $(loginFormSelector).validate().resetForm();
                    }
                }

                if (this.isAddressFormVisible()) {
                    this.source.set('params.invalid', false);
                    this.source.trigger('shippingAddress.data.validate');

                    if (this.source.get('shippingAddress.custom_attributes')) {
                        this.source.trigger('shippingAddress.custom_attributes.data.validate');
                    }

                    if (this.source.get('params.invalid') ||
                        !quote.shippingMethod() ||
                        !emailValidationResult ||
                        !shippingMethodValidationResult
                    ) {
                        if (!showErrors && this.canHideErrors) {
                            var shippingAddress = this.source.get('shippingAddress');
                            shippingAddress = _.extend({
                                region_id: '',
                                region_id_input: '',
                                region: ''
                            }, shippingAddress);
                            _.each(shippingAddress, function (value, index) {
                                self.hideErrorForElement(value, index);
                            });
                            this.source.set('params.invalid', false)
                        }

                        return false;
                    }
                }

                return emailValidationResult && shippingMethodValidationResult;
            },
            hideErrorForElement: function (value, index) {
                var self = this;
                if (typeof(value) === 'object') {
                    _.each(value, function (childValue, childIndex) {
                        var newIndex = (index === 'custom_attributes' ? childIndex : index + '.' + childIndex);
                        self.hideErrorForElement(childValue, newIndex);
                    })
                }

                var fieldObj = registry.get('checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.' + index);
                if (fieldObj) {
                    if (typeof (fieldObj.error) === 'function') {
                        fieldObj.error(false);
                    }
                }
            },
            initAddressFields: function () {
                var self = this;
                var formPath = 'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset';

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
                if (element.index !== 'postcode') {
                    if (element.component.indexOf('/group') !== -1) {
                        $.each(element.elems(), function (index, elem) {
                            self.bindHandler(elem);
                        });
                    } else {
                        element.on('value', function () {
                            clearTimeout(self.validateAddressTimeout);
                            self.validateAddressTimeout = setTimeout(function () {
                                if (shippingRatesValidator.validateFields(false)) {
                                    self.setShippingAddress();
                                }
                            }, delay);
                        });
                        observedElements.push(element);
                    }
                }
            },

            reSelectShippingMethod: function (time = 0) {
                let self = this;

                setTimeout(function () {
                    clearInterval(window.reSelectShippingMethod);
                    window.reSelectShippingMethod = setInterval(function () {

                        if(!self.checkoutData.shippingMethodCode) {
                            self.checkoutData.shippingMethodCode = $(self.shippingMethod).find('.shipping-type input').val();
                        }

                        if(self.checkoutData.shippingMethodCode && self.shippingMethod.length) {
                            let activeShippingMethod = $(self.shippingMethod).find('input[value="'+self.checkoutData.shippingMethodCode+'"]'),
                                activeShippingMethodCode = $('table.table-checkout-shipping-method tbody._active .shipping-type input').val();

                            if(activeShippingMethod.length) {
                                if(activeShippingMethod.val() != activeShippingMethodCode) {
                                    activeShippingMethod.trigger('click');
                                } else {
                                    clearInterval(window.reSelectShippingMethod);
                                }
                            } else {
                                self.checkoutData.shippingMethodCode = $(self.shippingMethod).find('.shipping-type input').val();
                                $(self.shippingMethod).find('.shipping-type input').trigger('click');
                                clearInterval(window.reSelectShippingMethod);
                            }
                        }
                    },500);
                }, time);
            },

            updateBreadcrumbs: function (step) {
                $('.breadcrumbs .breadcrumbs__item.active').addClass('done').removeClass('active');
                $('.breadcrumbs .breadcrumbs__item.'+step).addClass('active').removeClass('done');
                $('.breadcrumbs .breadcrumbs__item.pay').removeClass('done');
            },

            addressHandler: function () {
                let address = this.source.get('shippingAddress');

                if($('#shipping_address_id').length && !$('#shipping_address_id').data('selectize').getValue()) {
                    address['save_in_address_book'] = this.saveInAddressBook ? 1 : 0;
                } else if ($('#shipping_address_id').length && $('#shipping_address_id').data('selectize').getValue()) {
                    let customerAddressId = $('#shipping_address_id').data('selectize').getValue(),
                        customerAddresses = window.checkoutData.addressList;
                    address['save_in_address_book'] = 0;

                    if(customerAddresses) {
                        $.each(customerAddresses, function (key, customerAddress) {
                            if(customerAddressId === customerAddress.customerAddressId) {
                                $.each(address, function (k, v) {
                                    if(k == 'save_in_address_book') return true;
                                    if(k == 'country_id') k = "countryId";
                                    if(k == 'region_id') k = "regionId";
                                    if(v !== customerAddress[k] && customerAddress[k] !== null) {
                                        if(k === 'street') {
                                            if(v[0] === customerAddress[k][0] || v[1] === customerAddress[k][1]) {
                                                return true;
                                            }
                                        }
                                        address['save_in_address_book'] = 1;
                                    }
                                })
                            }
                        })
                    }
                }

                this.selectedAddress(address);
                checkoutData.setSelectedShippingAddress(address);
                this.isAddressFormVisible(true);
            },

            newAddressHandler: function () {
                let self = this;
                $(document).on('keyup', '.form-shipping-address input', function () {
                    if(quote.shippingAddress().getKey() === 'new-customer-address' && !self.isEmpty($(this).val())) {
                        iwdOpcAddressManager.newAddressHandler($(this).attr('id'));
                    }
                })
            }
        });
    }
);
