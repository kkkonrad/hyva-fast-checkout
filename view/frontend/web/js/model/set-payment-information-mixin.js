define([
    'jquery',
    'mage/utils/wrapper',
    'IWD_Opc/js/model/comment-assigner',
    'IWD_Opc/js/model/subscribe-assigner'
], function ($, wrapper, commentAssigner, subscribeAssigner) {
    'use strict';

    return function (placeOrderAction) {

        return wrapper.wrap(placeOrderAction, function (originalAction, messageContainer, paymentData) {
            commentAssigner(paymentData);
            subscribeAssigner(paymentData);

            return originalAction(messageContainer, paymentData);
        });
    };
});
