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
