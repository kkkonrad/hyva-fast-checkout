define(
    [
        'jquery',
        'ko',
        'Magento_Checkout/js/view/summary',
        'Magento_Checkout/js/model/step-navigator',
        'Magento_Checkout/js/model/quote',
        'Magento_Catalog/js/price-utils',
        'Magento_Checkout/js/checkout-data',
        'Magento_Checkout/js/model/full-screen-loader',
        'IWD_Opc/js/view/shipping'
    ],
    function(
        $,
        ko,
        Component,
        stepNavigator,
        quote,
        priceUtils,
        checkoutData,
        fullScreenLoader,
        shipping
    ) {
        'use strict';

        return Component.extend({
            checkoutConfig: window.checkoutConfig,
            checkoutData: window.checkoutData,
            addressFields:['firstname','lastname','street','countryId','regionId','region','city','postcode','telephone'],

            getFormattedPrice: function (price) {
                return priceUtils.formatPrice(price, quote.getPriceFormat());
            },

            updateCustomerEmailItem: function(customerData) {
                let self = this,
                    shipping = self.checkoutData.shipping;

                self.customerEmail(customerData.customerEmail);

                if (shipping.isMultiStepResolution() && shipping.AddressStep()) {
                    self.isVisible(false);
                    return false;
                }

                if (customerData.isEmailValid) {
                    if (!self.isVisible()) {
                        self.isVisible(true);
                    }
                    self.isVisibleCustomerEmail(true);
                } else {
                    if (!self.isVisibleShipBillAddress() && !self.isVisibleShippingMethod()) {
                        self.isVisible(false);
                    }
                    if (self.isVisibleCustomerEmail()) {
                        self.isVisibleCustomerEmail(false);
                    }
                }
            },

            updateShippingMethodItem: function(shippingMethodData) {
                try {
                    let self = this,
                        shipping = self.checkoutData.shipping;

                    if(!shippingMethodData.carrier_title || !shippingMethodData.method_title) {
                        return;
                    }

                    self.shippingMethodTitle(shippingMethodData.carrier_title + ' - ' + shippingMethodData.method_title);
                    self.shippingMethodAmount(self.getFormattedPrice(shippingMethodData.amount));

                    if (shipping.isMultiStepResolution() && shipping.AddressStep()) {
                        self.isVisible(false);
                        return false;
                    }

                    if (!self.isVisibleShippingMethod()) {
                        if (shipping.isMultiStepResolution() && shipping.DeliveryStep) {
                            self.isVisibleShippingMethod(false);
                        } else {
                            self.isVisibleShippingMethod(true);
                        }
                    }

                    if (!self.isVisible()) {
                        self.isVisible(true);
                    }
                } catch (e) {
                   // Do nothing
                }
            },

            getFullNameData: function (address) {
                let fullName;

                try {

                    if (address.firstname && address.lastname) {
                        return  address.firstname + ' ' + address.lastname;
                    }

                } catch (e) {

                }

                return '';
            },

            getStreetData: function (address) {
                try {
                    if (address['street[0]']) { return address['street[0]'] };
                } catch (e) {

                }

                return '';
            },

            getCityData: function (address) {
                let street = '';

                try {
                    if (address['city']) {street += address['city'] + ' ';}

                    if (address['region']) {street += address['region'] + ' ';}

                    if (address['country_id']) {street += address['country_id'] + ' ';}

                    if (address['postcode']) {street += address['postcode'];}
                } catch (e) {
                    street = '';
                }

                return street;
            },

            prepareAddress: function (type) {
                let address = {};

                if(type == 'shipping') {
                    var form = $('#co-shipping-form');
                } else {
                    var form = $('#billing-new-address-form');
                }

                for (var i = 0; i < form.serializeArray().length; i++) {
                    let obj = form.serializeArray()[i];
                    address[obj.name] = obj.value;
                }

                if(address['region_id']) {
                    let selectizeItem = form.find('div[name$="region_id"] .selectize-input .item');
                    address['region'] = selectizeItem.text();
                    address['region_id'] = selectizeItem.data('value');
                }

                return address;
            },

            updateAddress: function (type,address) {
                let self = this,
                    shipping = self.checkoutData.shipping;

                if (typeof shipping !== 'undefined' && shipping.isMultiStepResolution() && shipping.AddressStep()) {
                    self.isVisible(false);
                    return false;
                }

                if(type == 'shipping' || self.isAddressSame()) {
                    address = self.prepareAddress('shipping');
                } else {
                    address = self.prepareAddress('billing');
                }

                let title = 'Ship & Bill To';
                let fullName = self.getFullNameData(address);
                let street = self.getStreetData(address);
                let city = self.getCityData(address);

                if (!fullName || !street || !city) {
                    return false;
                }

                if (self.isAddressSame()) {
                    let address = [{ title:title, fullName:fullName, street:street, city:city }]
                    self.address(address);
                } else {
                    if (type == 'billing') {
                        let shippingAddress = self.prepareAddress('shipping');
                        let shippingFullName = self.getFullNameData(shippingAddress);
                        let shippingStreet = self.getStreetData(shippingAddress);
                        let shippingCity = self.getCityData(shippingAddress);

                        if (!shippingFullName || !shippingStreet || !shippingCity) {
                            return false;
                        }

                        self.billingAddress({ title: 'Bill To', fullName:fullName, street:street, city:city })
                        self.shippingAddress({ title: 'Ship To', fullName:shippingFullName, street:shippingStreet, city:shippingCity })
                    } else {
                        let billingAddress = self.prepareAddress('billing');
                        let billingFullName = self.getFullNameData(billingAddress);
                        let billingStreet = self.getStreetData(billingAddress);
                        let billingCity = self.getCityData(billingAddress);

                        if (!billingFullName || !billingStreet || !billingCity) {
                            return false;
                        }

                        self.billingAddress({ title: 'Bill To', fullName:billingFullName, street:billingStreet, city:billingCity })
                        self.shippingAddress({ title: 'Ship To', fullName:fullName, street:street, city:city })
                    }

                    let address = [self.shippingAddress(),self.billingAddress()]
                    self.address(address);
                }

                if (!self.isVisibleShipBillAddress()) {
                    self.isVisibleShipBillAddress(true);
                }

                if (!self.isVisible()) {
                    self.isVisible(true);
                }

            },

            subscribeShipping: function () {
                let self = this,
                    shippingInterval,
                    shippingTimeout;

                shippingInterval = setInterval(function (){
                    let shipping = self.checkoutData.shipping;

                    if (typeof shipping.isMultiStepResolution() !== 'undefined') {

                        if (!shipping.isMultiStepResolution()) {
                            self.isVisibleShoppingCartLink(true);
                        }

                        shipping.isMultiStepResolution.subscribe(function (isMultiStepResolution) {
                            let infoItem = $('.info-item');

                            if (isMultiStepResolution && shipping.AddressStep()) {
                                self.isVisible(false);
                            } else {
                                self.updateAddress('billing',quote.billingAddress());
                                self.updateAddress('shipping',quote.shippingAddress());
                            }

                            if (!isMultiStepResolution) {
                                infoItem.addClass('onepage').removeClass('multistep');
                                self.isEditLinkVisible(false);
                                self.isVisibleShoppingCartLink(true);
                            } else {
                                infoItem.removeClass('onepage').addClass('multistep');
                                self.isEditLinkVisible(true);
                                self.isVisibleShoppingCartLink(false);
                            }

                        });

                        shipping.AddressStep.subscribe(function (AddressStep) {
                            if (shipping.isMultiStepResolution() && AddressStep) {
                                self.isVisible(false);
                                self.isVisibleCustomerEmail(false);
                                self.isShipBillAddressSame(false);
                                self.isVisibleShippingMethod(false);
                            } else {
                                self.updateAddress('billing',quote.billingAddress());
                                self.updateAddress('shipping',quote.shippingAddress());
                            }
                        });

                        shipping.DeliveryStep.subscribe(function (DeliveryStep) {
                            if (shipping.isMultiStepResolution() && DeliveryStep) {
                                self.isVisibleCustomerEmail(true);
                                self.isShipBillAddressSame(true);
                                self.isVisibleShippingMethod(false);
                            }

                        });

                        $(document).on('click','.info-block .info-item .title .edit-address', function () {
                            shipping.goToAddressStep();
                        });

                        $(document).on('click','.info-block .info-item .title .edit-method', function () {
                            shipping.goToDeliveryStep();
                        });

                        clearInterval(shippingInterval);
                        clearTimeout(shippingTimeout);
                    }
                },200)

                shippingTimeout = setTimeout(function () {
                    clearInterval(shippingInterval);
                },5000)
            },

            subscribePayment: function () {
                let self = this,
                    paymentInterval,
                    paymentTimeout;

                paymentInterval = setInterval(function (){
                    let payment = self.checkoutData.payment;

                    if (typeof payment.isMultiStepResolution() !== 'undefined') {

                        payment.PaymentStep.subscribe(function (PaymentStep) {
                            if (payment.isMultiStepResolution() && PaymentStep) {
                                self.isVisibleCustomerEmail(true);
                                self.isShipBillAddressSame(true);
                                self.isVisibleShippingMethod(true);
                            }
                        });

                        clearInterval(paymentInterval);
                        clearTimeout(paymentTimeout);
                    }
                },200)

                paymentTimeout = setTimeout(function () {
                    clearInterval(paymentInterval);
                },5000)
            },

            customEventListener: function () {
                let self = this;

                window.addEventListener('load', function (event) {
                    self.updateAddress('billing',{});
                    self.updateAddress('shipping',{});
                })

                $(document).on('change','input, select', function () {
                  self.updateAddress('billing',{});
                  self.updateAddress('shipping',{});
                });
            },

            initialize: function () {
                var self = this, customerEmail;
                this._super().observe({
                    isVisible: false,
                    isVisibleCustomerEmail: false,
                    isVisibleShipBillAddress: false,
                    isVisibleShippingMethod: false,
                    isShipBillAddressSame: true,
                    isVisibleShoppingCartLink: false,
                    isEditLinkVisible: ko.observable(false),
                    isAddressSame: true,
                    customerEmail: quote.guestEmail ? quote.guestEmail : window.checkoutConfig.customerData.email,
                    shippingMethodTitle: '',
                    shippingMethodAmount: '',
                    billingAddress: {},
                    shippingAddress: {},
                    address: [{title: '',  fullName: '', street: '', city: ''},],
                });

                self.checkoutData.infoBlock = this;

                quote.shippingMethod.subscribe(function (shippingMethod) {
                    self.updateShippingMethodItem(shippingMethod);
                });

                quote.billingAddress.subscribe(function (billingAddress) {
                    self.updateAddress('billing',billingAddress);
                });

                quote.shippingAddress.subscribe(function (shippingAddress) {
                    self.updateAddress('shipping', shippingAddress);
                });

                self.subscribeShipping();
                self.subscribePayment();
                self.customEventListener();
            },

            customerEventListener: function () {
                let user = $('input[name=username]'),
                customerEmail = this.customerEmail() ? this.customerEmail() : (user.length && user.val().length) ? user.val() : null;

                if(customerEmail) {
                    this.updateCustomerEmailItem({customerEmail:customerEmail,isEmailValid:true});
                }
            }

        });
    }
);
