define([
    'jquery',
    'IWD_Opc/js/model/quote',
    'IWD_Opc/js/checkout-data'
], function ($, quote, checkoutData) {
    'use strict';

    return function (paymentData) {
        if (!quote.isShowComment()) {
            return;
        }

        if (paymentData['extension_attributes'] === undefined) {
            paymentData['extension_attributes'] = {};
        }

        paymentData['extension_attributes']['comment'] = checkoutData.getComment();
    };
});
