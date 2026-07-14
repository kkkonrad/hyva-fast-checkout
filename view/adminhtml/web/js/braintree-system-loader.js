require([
    'prototype'
], function () {
    'use strict';

    // PayPal_Braintree/js/system uses Prototype's Array#each without declaring
    // Prototype as a dependency. Load it only after Prototype is initialized.
    require(['PayPal_Braintree/js/system']);
});
