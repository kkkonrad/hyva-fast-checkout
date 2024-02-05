require([
    "jquery",
    "IWD_Opc/js/ga4Events"
], function (
    $,
    ga4Events
) {

    $(document).on('focus','input',function (e) {
        AddressFields.addFocusClassToField($(this));
    });

    $(document).on('focusout blur','input',function (e) {
        AddressFields.removeFocusClassFromInput($(this));

        let id = $(this).attr('id'), safari = false;

        if($(this).val() && id && id.search("-selectized") !== -1) {
            let field = $(this).closest('.field');
            if(field.attr('name') === 'shippingAddress.country_id') $(this).attr('selector', ".form-shipping-address [name='country_id']");
            if(field.attr('name') === 'shippingAddress.region_id') $(this).attr('selector', ".form-shipping-address [name='region_id']");
            if(field.attr('name') === 'billingAddress.country_id') $(this).attr('selector', ".billing-address-form [name='country_id']");
            if(field.attr('name') === 'billingAddress.region_id') $(this).attr('selector', ".billing-address-form [name='region_id']");
            safari = true;
        }

        if(($(this).attr('name') == 'shipping-country-id' || $(this).attr('name') == 'billing-country-id' || $(this).attr('name') == 'shipping-region-id' || $(this).attr('name') == 'billing-region-id') && $(this).val() || safari) {
            let selector = $(this).attr('selector');
            let options = $(selector).data('selectize').options;
            let value = $.trim($(this).val());

            if(value.length == 2 && window.checkoutData.countryCollection && ($(this).attr('name') == 'shipping-region-id' || $(this).attr('name') == 'billing-region-id')) {
                let countrySelector = ".form-shipping-address [name='country_id']",
                    countryValue,
                    countryCollection = JSON.parse(window.checkoutData.countryCollection);

                if($(this).attr('name') == 'billing-region-id') {
                    countrySelector = ".billing-address-form [name='country_id']";
                }

                countryValue = $(countrySelector).data('selectize').getValue();

                let currentRegion = countryCollection.filter(function (collection) {
                    return collection.country_id == countryValue && collection.code == value;
                });

                if(currentRegion) {
                    value = currentRegion[0].name;
                }
            }

            var option = _.find(options, function (option) {
                return option.text === value;
            });

            if(option) {
                let selectizeDropdown = $(selector).closest('.control').find('.selectize-dropdown');
                selectizeDropdown.addClass('iwdHide');

                if($(selector).data('selectize').getValue() != option.value) {
                    $(selector).data('selectize').setValue(option.value);
                }

                $(this).val('');
                $(this).closest('.control').removeClass('focus');
                document.activeElement.blur();

                setTimeout(function () {
                    document.activeElement.blur();
                    selectizeDropdown.removeClass('iwdHide');
                    $('#' + $(selector).attr('id')).data('selectize').close();
                    $('#' + $(selector).attr('id')).data('selectize').blur();
                },250)
            }
        }
    });

    document.addEventListener('keydown', event => {
        if(window.checkoutData.loader) {
            event.preventDefault();
            return false;
        }
    });

    var AddressFields = {
        addFocusClassToField: function (input) {
            input.closest('.control').addClass('focus');
        },
        removeFocusClassFromInput: function (input) {
            let val = input.val();
            if (!val || val.length === 0) {
                input.closest('.control').removeClass('focus');
            }
        },
    };

    $(document).on('click touch','.dropdown-active .input-text',function (event) {
        document.activeElement.blur();
    });

    jQuery(document).on('click touch','.iwd-edit-cart a', function (event) {
        event.preventDefault();
        ga4Events.editCartEvent();
        window.location.href = window.location.origin + '/checkout/cart/';
    })
});
