require(["jquery"], function ($) {

    $(document).on('focus','input',function (e) {
        AddressFields.addFocusClassToField($(this));
    });

    $(document).on('focusout blur','input',function (e) {
        AddressFields.removeFocusClassFromInput($(this));
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
});
