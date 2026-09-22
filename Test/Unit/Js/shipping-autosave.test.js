'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function observable(value) {
    const subscribers = [];
    const result = function (next) {
        if (arguments.length) {
            value = next;
            subscribers.forEach(callback => callback(value));
        }
        return value;
    };
    result.subscribe = callback => subscribers.push(callback);
    return result;
}

test('autosave uses configured rules silently, syncs form and retries after the last field', () => {
    let queued, providerChanged, saves = 0, loggedIn = false;
    const firstname = observable('');
    const telephone = observable('');
    const custom = observable('');
    const email = observable('');
    const fields = [firstname, telephone, custom].map(value => ({
        provider: 'checkoutProvider', dataScope: 'shippingAddress.field',
        validation: {'required-entry': true}, value, visible: true, disabled: false
    }));
    const quote = {
        isVirtual: () => false,
        shippingMethod: observable({carrier_code: 'flatrate', method_code: 'flatrate'}),
        shippingAddress: observable({firstname: '', extensionAttributes: {pickup: 'kept'}})
    };
    const shipping = {
        name: 'shipping', isFormInline: true,
        source: {
            get: () => ({firstname: firstname(), telephone: telephone(), custom: custom()}),
            on: (name, callback) => { assert.equal(name, 'shippingAddress'); providerChanged = callback; }
        },
        validateShippingInformation: () => assert.fail('must not run carrier/form validation')
    };
    const loading = observable(false);
    const autosave = loadAmd('model/shipping-autosave.js', {
        jquery: {extend: Object.assign},
        ko: {unwrap: value => typeof value === 'function' ? value() : value},
        underscore: {isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b)},
        uiRegistry: {
            get: query => typeof query === 'function' ? fields.forEach(query) : {email},
            async: () => callback => callback({email})
        },
        'Magento_Ui/js/lib/validation/validator': (rules, value) => ({
            passed: (!rules['required-entry'] || Boolean(value)) &&
                (!rules['validate-email'] || String(value).includes('@'))
        }),
        'Magento_Customer/js/model/customer': {isLoggedIn: () => loggedIn},
        'Magento_Checkout/js/model/quote': quote,
        'Magento_Checkout/js/model/address-converter': {formAddressDataToQuoteAddress: data => data},
        'Magento_Checkout/js/action/select-shipping-address': quote.shippingAddress,
        'Magento_Checkout/js/model/shipping-service': {isLoading: loading},
        'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator': {ensureSaved: () => saves++}
    }, {
        window: {clearTimeout() {}, setTimeout: callback => { queued = callback; }}
    });
    autosave.start(shipping);
    queued();
    assert.equal(saves, 0);
    firstname('Jan'); telephone('123456789'); email('jan@example.com');
    queued();
    assert.equal(saves, 0, 'required custom fields count too');
    custom('value'); providerChanged(); queued();
    assert.equal(saves, 1);
    assert.equal(quote.shippingAddress().telephone, '123456789');
    assert.equal(quote.shippingAddress().extensionAttributes.pickup, 'kept');
    assert.equal(quote.guestEmail, 'jan@example.com');
    fields[2].visible = false; custom('');
    assert.equal(autosave.prepareAddress(shipping), true);
    loading(true);
    assert.equal(autosave.prepareAddress(shipping), false);
    loading(false); queued();
    assert.equal(saves, 2);
    quote.shippingMethod(null);
    assert.equal(autosave.prepareAddress(shipping), false);
    quote.shippingMethod({carrier_code: 'flatrate', method_code: 'flatrate'});
    shipping.isFormInline = false; loggedIn = true; email('');
    assert.equal(autosave.prepareAddress(shipping), true, 'saved customer address skips inline fields');
    quote.isVirtual = () => true;
    assert.equal(autosave.prepareAddress(shipping), false);
});
