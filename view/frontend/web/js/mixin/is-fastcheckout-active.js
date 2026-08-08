define(function () {
    'use strict';

    return function () {
        return !!(
            document.body &&
            document.body.classList.contains('fastcheckout-checkout-page')
        );
    };
});
