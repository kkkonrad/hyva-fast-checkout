'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('uses Magento shipping and billing components as one additional validator', () => {
    let validator;
    let billingAddress = null;
    let shippingValid = false;
    let shippingCalls = 0;
    let billingUpdates = 0;
    const shippingAddress = {id: 'shipping'};
    const quote = {
        isVirtual: () => false,
        paymentMethod: () => ({method: 'purchaseorder'}),
        shippingAddress: () => shippingAddress,
        billingAddress: () => billingAddress
    };
    const billing = {
        isAddressSameAsShipping: () => true,
        updateAddress() {
            billingUpdates += 1;
        }
    };
    const registry = {
        get(name) {
            if (name === 'checkout.steps.shipping-step.shippingAddress') {
                return {
                    validateShippingInformation() {
                        shippingCalls += 1;
                        return shippingValid;
                    }
                };
            }
            if (name.endsWith('.payments-list.purchaseorder-form')) {
                return billing;
            }
            return null;
        }
    };
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/model/one-step-validator.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        define(dependencies, factory) {
            validator = factory(
                () => ({length: 0}),
                quote,
                (address) => {
                    billingAddress = address;
                },
                registry
            );
        }
    });

    assert.equal(validator.validate(), false);
    assert.equal(shippingCalls, 1);
    assert.equal(billingUpdates, 0);

    shippingValid = true;
    assert.equal(validator.validate(), true);
    assert.equal(shippingCalls, 2);
    assert.equal(billingAddress, shippingAddress);
    assert.equal(billingUpdates, 0);
});

test('validates the native shipping form before reporting a missing method', () => {
    let validator;
    let addressInvalid = true;
    let shippingMethod = null;
    let addressCalls = 0;
    let shippingCalls = 0;
    let focusCalls = 0;
    const sourceProvider = {
        invalid: false,
        set(path, value) {
            assert.equal(path, 'params.invalid');
            this.invalid = value;
        },
        get(path) {
            assert.equal(path, 'params.invalid');
            return this.invalid;
        }
    };
    const shipping = {
        source: sourceProvider,
        triggerShippingDataValidateEvent() {
            addressCalls += 1;
            sourceProvider.invalid = addressInvalid;
        },
        focusInvalid() {
            focusCalls += 1;
        },
        validateShippingInformation() {
            shippingCalls += 1;
            return false;
        }
    };
    const quote = {
        isVirtual: () => false,
        shippingMethod: () => shippingMethod
    };
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/model/one-step-validator.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        define(dependencies, factory) {
            validator = factory(
                () => ({length: 0}),
                quote,
                () => {},
                {get: () => shipping}
            );
        }
    });

    assert.equal(validator.validateShippingInformation(), false);
    assert.equal(addressCalls, 1);
    assert.equal(focusCalls, 1);
    assert.equal(shippingCalls, 0);

    addressInvalid = false;
    assert.equal(validator.validateShippingInformation(), false);
    assert.equal(addressCalls, 2);
    assert.equal(shippingCalls, 1);

    shippingMethod = {carrier_code: 'flatrate', method_code: 'flatrate'};
    assert.equal(validator.validateShippingInformation(), false);
    assert.equal(addressCalls, 2);
    assert.equal(shippingCalls, 2);
});

function loadValidator(quote, selectBillingAddress, registry) {
    let validator;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/model/one-step-validator.js'),
        'utf8'
    );

    vm.runInNewContext(source, {
        define(dependencies, factory) {
            validator = factory(
                () => ({length: 0}),
                quote,
                selectBillingAddress,
                registry
            );
        }
    });

    return validator;
}

test('re-applies shipping as billing when cache keys drift', () => {
    let billingAddress = {
        getCacheKey: () => 'billing-old',
        getType: () => 'new-customer-address'
    };
    const shippingAddress = {
        getCacheKey: () => 'shipping-new',
        getType: () => 'new-customer-address'
    };
    let sameAsShipping = false;
    let detailsVisible = false;
    const billing = {
        isAddressSameAsShipping(value) {
            if (typeof value === 'undefined') {
                return sameAsShipping;
            }
            sameAsShipping = value;
        },
        isAddressDetailsVisible(value) {
            if (typeof value === 'undefined') {
                return detailsVisible;
            }
            detailsVisible = value;
        }
    };
    const validator = loadValidator(
        {
            isVirtual: () => false,
            paymentMethod: () => ({method: 'purchaseorder'}),
            shippingAddress: () => shippingAddress,
            billingAddress: () => billingAddress
        },
        (address) => {
            billingAddress = address;
        },
        {
            get(name) {
                return name.endsWith('.payments-list.purchaseorder-form') ? billing : null;
            }
        }
    );

    assert.equal(validator.validateBillingAddress(), true);
    assert.equal(billingAddress, shippingAddress);
    assert.equal(sameAsShipping, true);
    assert.equal(detailsVisible, true);
});

test('does not overwrite a separate billing address the customer opened', () => {
    let billingAddress = null;
    let billingUpdates = 0;
    const shippingAddress = {
        getCacheKey: () => 'shipping',
        getType: () => 'new-customer-address'
    };
    const billing = {
        isAddressSameAsShipping: () => false,
        updateAddress() {
            billingUpdates += 1;
        }
    };
    const validator = loadValidator(
        {
            isVirtual: () => false,
            paymentMethod: () => ({method: 'purchaseorder'}),
            shippingAddress: () => shippingAddress,
            billingAddress: () => billingAddress
        },
        (address) => {
            billingAddress = address;
        },
        {
            get(name) {
                return name.endsWith('.payments-list.purchaseorder-form') ? billing : null;
            }
        }
    );

    validator.setBillingFollowsShipping(false);
    assert.equal(validator.doesBillingFollowShipping(), false);
    assert.equal(validator.validateBillingAddress(), false);
    assert.equal(billingUpdates, 1);
    assert.equal(billingAddress, null);
});
