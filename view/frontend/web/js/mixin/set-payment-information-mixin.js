define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setPaymentInformationAction) {
        return wrapper.wrap(setPaymentInformationAction, function (originalAction) {
            return originalAction.apply(this, Array.prototype.slice.call(arguments, 1));
        });
    };
});
