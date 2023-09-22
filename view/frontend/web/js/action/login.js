define(
    [
        'jquery',
        'mage/storage',
        'Magento_Ui/js/model/messageList',
        'Magento_Customer/js/customer-data',
        'Magento_Checkout/js/model/full-screen-loader'
    ],
    function ($, storage, globalMessageList, customerData, fullScreenLoader) {
        'use strict';
        var callbacks = [],
            action = function (loginData, redirectUrl, isGlobal, messageContainer, emailObj) {
                messageContainer = messageContainer || globalMessageList;
                if (emailObj) {
                    emailObj.isLoading(true);
                }

                return storage.post(
                    'customer/ajax/login',
                    JSON.stringify(loginData),
                    isGlobal
                ).done(function (response) {
                    if (emailObj) {
                        emailObj.isLoading(false);
                    }

                    if (response.errors) {
                        messageContainer.addErrorMessage(response);
                        callbacks.forEach(function (callback) {
                            callback(loginData);
                        });
                    } else {
                        callbacks.forEach(function (callback) {
                            callback(loginData);
                        });
                        customerData.invalidate(['customer']);
                        fullScreenLoader.startLoader();
                        if (redirectUrl) {
                            window.location.href = redirectUrl;
                        } else if (response.redirectUrl) {
                            window.location.href = response.redirectUrl;
                        } else {
                            location.reload();
                        }
                    }
                }).fail(function () {
                    if (emailObj) {
                        emailObj.isLoading(false);
                    }

                    messageContainer.addErrorMessage({'message': 'Could not authenticate. Please try again later'});
                    callbacks.forEach(function (callback) {
                        callback(loginData);
                    });
                })
            };

        action.registerLoginCallback = function (callback) {
            callbacks.push(callback);
        };

        return action;
    }
);
