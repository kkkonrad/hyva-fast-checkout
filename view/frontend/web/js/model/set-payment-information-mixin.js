define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/model/comment-assigner',
    'Kkkonrad_Fastcheckout/js/model/subscribe-assigner'
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
