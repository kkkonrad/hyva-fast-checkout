'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let compatibility;
let value = null;
let mutations = 0;

function shippingAddress(next) {
    if (arguments.length) {
        value = next;
    }
    return value;
}

Object.setPrototypeOf(shippingAddress, Object.assign(Object.create(Function.prototype), {
    peek: () => value,
    extend: () => shippingAddress,
    notifySubscribers: current => {
        if (current === value) {
            mutations += 1;
        }
    }
}));
shippingAddress.subscribe = () => {};

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/hyva/checkout-compatibility.js'),
        'utf8'
    ),
    {
        window: { checkoutConfig: {} },
        Object,
        define: (deps, factory) => { compatibility = factory(); }
    }
);

const quote = {
    shippingAddress,
    billingAddress: shippingAddress
};
compatibility.ensureQuoteAddressCacheKeys(quote);
quote.shippingAddress({});
quote.shippingAddress.valueHasMutated();

if (typeof quote.shippingAddress().getType !== 'function' || mutations !== 1) {
    throw new Error('Wrapped quote address lost Magento or Knockout methods.');
}

console.log('checkout compatibility: OK');
