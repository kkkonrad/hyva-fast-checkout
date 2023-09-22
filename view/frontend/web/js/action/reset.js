define(
    [
        'jquery',
        'mage/storage',
        'Magento_Checkout/js/model/quote',
        'Magento_Ui/js/model/messageList'
    ],
    function ($, storage, quote, globalMessageList) {
        'use strict';
        var callbacks = [],
            action = function (resetData, redirectUrl, isGlobal, messageContainer) {
                messageContainer = messageContainer || globalMessageList;
                return storage.post(
                    quote.getForgotPasswordUrl(),
                    JSON.stringify(resetData),
                    isGlobal
                ).done(function (response) {
                    if (response.errors) {
                        messageContainer.addErrorMessage(response);
                        callbacks.forEach(function (callback) {
                            callback(resetData);
                        });
                    } else {
                        messageContainer.addSuccessMessage(response);
                        callbacks.forEach(function (callback) {
                            callback(resetData);
                        });
                    }
                }).fail(function () {
                    messageContainer.addErrorMessage({'message': 'Could not reset your password. Please try again later'});
                    callbacks.forEach(function (callback) {
                        callback(resetData);
                    });
                });
            };

        action.registerResetCallback = function (callback) {
            callbacks.push(callback);
        };

        return action;
    }
);
