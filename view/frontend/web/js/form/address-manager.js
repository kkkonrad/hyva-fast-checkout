define([
    'jquery'
], function ($) {
    'use strict';

    var options = {
        'shipping' : '#shipping-new-address-form',
        'billing'  : '#billing-new-address-form',
        'delay'    : 1400
    };

    return {
        requiredInputFields: {
            'firstname' : 1,
            'lastname'  : 1,
            'street[0]' : 1,
            'city'      : 1,
            'postcode'  : 1,
            'telephone' : 1
        },

        validationAction: function (form) {
            let self = this,
                input = $(form).find('input:visible'),
                select = $(form).find('select');

            input.each(function () {
                if (self.requiredInputFields[$(this).attr('name')] && self.isEmpty($(this).val())) {
                    $(this).trigger('change');
                }
            });

            select.each(function () {
                if (self.isEmpty($(this).find('option:selected').val())) {
                    $(this).trigger('change')
                }
            });
        },

        shippingAddressValidation: function () {
            this.validationAction(options.shipping);
        },

        billingAddressValidation: function () {
            this.validationAction(options.billing);
        },

        addressValidation: function () {
            this.shippingAddressValidation();
            this.billingAddressValidation();
        },

        setCustomerData: function (form, customer) {
            // set custom first name and last name from customer data
            let customerData = customer.customerData;
            if(customerData && customerData.firstname && customerData.lastname) {
                let firstname = form.find('input[name="firstname"]'),
                    lastname = form.find('input[name="lastname"]');
                firstname.val(customerData.firstname).trigger('change');
                this.toggleInput(firstname);
                lastname.val(customerData.lastname).trigger('change');
                this.toggleInput(lastname);
            }
        },

        isNewCustomerAddressValid: function () {
            let self = this,
                isNewCustomerAddressValid = true,
                input = $(options.shipping).find('input:visible'),
                select = $('#shipping-new-address-form').find('select');

            if(input.length) {
                input.each(function () {
                    if (self.requiredInputFields[$(this).attr('name')] && self.isEmpty($(this).val())) {
                        isNewCustomerAddressValid = false;
                    }
                });
            } else {
                isNewCustomerAddressValid = false;
            }

            if(select.length) {
                select.each(function () {
                    if (self.isEmpty($(this).find('option:selected').val())) {
                        isNewCustomerAddressValid = false;
                    }
                });
            } else {
                isNewCustomerAddressValid = false;
            }

            return isNewCustomerAddressValid;
        },

        isEmpty: function (value) {
            return (!value || value.length === 0);
        },

        toggleInput: function (input) {
            if (!this.isEmpty(input.val())) {
                input.closest('.control').addClass('focus');
            } else {
                input.closest('.control').removeClass('focus');
            }
        },

        newAddressHandler: function (id) {
            let self = this;

            setTimeout(function (id) {
                if($('table.table-checkout-shipping-method tbody').length) return;
                if(!self.isNewCustomerAddressValid()) return;
                if(id !== document.activeElement.id) return;
                $('#'+id).trigger('change');
            },options.delay, id)
        },

        isBillingAddressHasEmptyField: function () {
            let self = this,
                input = $(options.billing).find('input:visible'),
                select = $(options.billing).find('select'),
                result = false;

            input.each(function () {
                if (self.requiredInputFields[$(this).attr('name')] && self.isEmpty($(this).val())) {
                    result = true;
                }
            });

            select.each(function () {
                if (self.isEmpty($(this).find('option:selected').val())) {
                    result = true;
                }
            });

            return result;
        }
    }
})
