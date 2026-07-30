'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const events = [];
const fields = [
    {
        matches: selector => selector.includes('select'),
        dispatchEvent: event => events.push(event.type)
    },
    {
        matches: () => false,
        dispatchEvent: event => events.push(event.type)
    }
];
const document = {
    addEventListener: () => {},
    querySelectorAll: () => fields
};
const window = {};
let mixin;

vm.runInNewContext(
    fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/shipping-view-mixin.js'),
        'utf8'
    ),
    {
        window,
        document,
        Event: function (type) { this.type = type; },
        define: (deps, factory) => {
            mixin = factory(
                {},
                {},
                () => {},
                {},
                {}
            );
        },
        setTimeout,
        clearTimeout,
        Date,
        console
    }
);

let coreCalled = false;
const component = mixin({
    extend: methods => Object.assign(methods, {
        _super: () => {
            coreCalled = true;
            return 'saved';
        }
    })
});

if (component.saveNewAddress() !== 'saved' || !coreCalled) {
    throw new Error('Core Magento saveNewAddress was not called.');
}
if (events.join(',') !== 'change,keyup') {
    throw new Error('Popup fields were not synchronized before validation.');
}

console.log('shipping popup sync: OK');
