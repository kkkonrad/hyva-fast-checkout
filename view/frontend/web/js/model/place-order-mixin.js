define([
    'jquery',
    'mage/utils/wrapper',
    'IWD_Opc/js/model/comment-assigner',
    'IWD_Opc/js/model/subscribe-assigner'
], function ($, wrapper, commentAssigner, subscribeAssigner) {
    'use strict';

    return function (placeOrderAction) {

        return wrapper.wrap(placeOrderAction, function (originalAction, paymentData, messageContainer) {
            commentAssigner(paymentData);
            subscribeAssigner(paymentData);

            return originalAction(paymentData, messageContainer);
        });
    };
});
