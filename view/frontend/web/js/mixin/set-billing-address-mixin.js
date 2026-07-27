define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setBillingAddressAction) {
        return wrapper.wrap(setBillingAddressAction, function (originalAction) {
            return originalAction.apply(this, Array.prototype.slice.call(arguments, 1));
        });
    };
});
