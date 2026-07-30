'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function run(addresses, newShipping, shipping, selectedShipping) {
    const stored = { newShipping, shipping, selectedShipping };
    const checkoutData = {
        getShippingAddressFromData: () => stored.shipping || null,
        getBillingAddressFromData: () => null,
        getNewCustomerShippingAddress: () => stored.newShipping || null,
        setShippingAddressFromData: value => { stored.shipping = value; },
        setNewCustomerShippingAddress: value => { stored.newShipping = value; }
    };
    const resolver = { resolveShippingAddress: () => stored.resolved = stored.shipping };
    const modules = {
        'mage/utils/wrapper': {
            wrap: (original, wrapped) => function () {
                return wrapped.apply(this, [original].concat(Array.from(arguments)));
            }
        },
        'Magento_Checkout/js/model/quote': {
            shippingAddress: () => null,
            billingAddress: () => null
        },
        'Magento_Checkout/js/checkout-data': checkoutData,
        'Magento_Checkout/js/model/address-converter': {},
        'Magento_Customer/js/customer-data': {
            get: () => () => ({
                newCustomerShippingAddress: { default: stored.newShipping },
                shippingAddressFromData: { default: stored.shipping },
                selectedShippingAddress: stored.selectedShipping
            }),
            set: (section, data) => {
                stored.newShipping = data.newCustomerShippingAddress.default;
                stored.shipping = data.shippingAddressFromData.default;
                stored.selectedShipping = data.selectedShippingAddress;
            }
        },
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => true
    };
    let mixin;
    const window = {
        checkoutConfig: {
            isCustomerLoggedIn: true,
            customerData: { firstname: 'Jan', lastname: 'Testowy', addresses: addresses }
        }
    };

    vm.runInNewContext(
        fs.readFileSync(path.resolve(__dirname, '../../../view/frontend/web/js/mixin/checkout-data-resolver-mixin.js'), 'utf8'),
        { window: window, Object: Object, define: (deps, factory) => { mixin = factory(...deps.map(dep => modules[dep])); } }
    );
    mixin(resolver).resolveShippingAddress();

    return stored;
}

const withoutAddress = run({});
if (!withoutAddress.resolved || withoutAddress.resolved.firstname !== 'Jan' ||
    withoutAddress.resolved.lastname !== 'Testowy') {
    throw new Error('Customer name was not applied to a new shipping address.');
}

if (withoutAddress.newShipping) {
    throw new Error('Customer name must not create a second address-list item.');
}

if (run({ 1: { id: 1 } }).shipping) {
    throw new Error('Saved customer addresses must remain Magento-owned.');
}

if (run({ 1: { id: 1 } }, { customer_address_id: 1 }).newShipping) {
    throw new Error('A persisted duplicate of a saved address was not cleared.');
}

const savedAddress = {
    id: 1,
    firstname: 'Jan',
    lastname: 'Testowy',
    street: ['Testowa 1'],
    city: 'Warszawa',
    postcode: '00-001',
    country_id: 'PL',
    telephone: '500600700'
};
const duplicateWithoutId = Object.assign({}, savedAddress, { id: undefined });
const clearedDuplicate = run(
    { 1: savedAddress },
    duplicateWithoutId,
    duplicateWithoutId,
    'new-customer-address'
);
if (clearedDuplicate.newShipping || clearedDuplicate.shipping ||
    clearedDuplicate.selectedShipping) {
    throw new Error('A duplicate address without a customer address ID was not cleared.');
}

if (!run({ 1: savedAddress }, Object.assign({}, savedAddress, {
    street: ['Inna 2']
})).newShipping) {
    throw new Error('A genuinely different new address was cleared.');
}

console.log('customer address resolver: OK');
