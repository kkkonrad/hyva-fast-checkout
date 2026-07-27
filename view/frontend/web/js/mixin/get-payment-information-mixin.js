define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (getPaymentInformationAction) {
        return wrapper.wrap(getPaymentInformationAction, function (originalAction, deferred, messageContainer) {
            return originalAction(deferred, messageContainer);
        });
    };
});
