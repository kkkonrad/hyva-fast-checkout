define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setPaymentInformationExtendedAction) {
        return wrapper.wrap(setPaymentInformationExtendedAction, function (originalAction) {
            return originalAction.apply(this, Array.prototype.slice.call(arguments, 1));
        });
    };
});
