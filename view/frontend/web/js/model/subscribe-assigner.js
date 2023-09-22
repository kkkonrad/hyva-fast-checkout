define([
    'jquery',
    'IWD_Opc/js/model/quote',
    'IWD_Opc/js/checkout-data'
], function ($, quote, checkoutData) {
    'use strict';

    return function (paymentData) {
        if (!quote.isShowSubscribe()) {
            return;
        }
        delete    paymentData.__disableTmpl;
        if (paymentData['extension_attributes'] === undefined) {
            paymentData['extension_attributes'] = {};
        }

        paymentData['extension_attributes']['subscribe'] = checkoutData.getIsSubscribe();
    };
});
