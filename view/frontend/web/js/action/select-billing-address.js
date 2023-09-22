define([
    'jquery',
    '../model/quote'
], function ($, quote) {
    'use strict';

    return function (billingAddress) {
        var address = null;

        try {
            if (quote.shippingAddress() && billingAddress.getCacheKey() == //eslint-disable-line eqeqeq
                quote.shippingAddress().getCacheKey()
            ) {
                address = $.extend(true, {}, billingAddress);
                address.saveInAddressBook = null;
            } else {
                address = billingAddress;
            }
        } catch (e) {
            address = null;
        }
        
        quote.billingAddress(address);
    };
});
