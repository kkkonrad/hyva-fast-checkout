'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const loadAmd = require('./amd');

function loadValidator(quote, selectBillingAddress, registry, globals = {}) {
    return loadAmd('model/one-step-validator.js', {
        jquery: () => ({length: 0}),
        'Magento_Checkout/js/model/quote': quote,
        'Magento_Checkout/js/action/select-billing-address': selectBillingAddress,
        uiRegistry: registry
    }, globals);
}

test('uses Magento shipping and billing components as one additional validator', () => {
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
    const validator = loadValidator(quote, (address) => {
        billingAddress = address;
    }, registry);

    assert.equal(validator.validate(), false);
    assert.equal(shippingCalls, 1);
    assert.equal(billingUpdates, 0);

    shippingValid = true;
    assert.equal(validator.validate(), true);
    assert.equal(shippingCalls, 2);
    assert.equal(billingAddress, shippingAddress);
    assert.equal(billingUpdates, 0);
});

test('exposes native shipping-address validation to the shipping mixin', () => {
    let addressInvalid = true;
    let addressCalls = 0;
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
        }
    };
    const quote = {
        isVirtual: () => false
    };
    const validator = loadValidator(quote, () => {}, {get: () => shipping});

    assert.equal(validator.validateShippingAddress(shipping), false);
    assert.equal(addressCalls, 1);
    assert.equal(focusCalls, 1);

    addressInvalid = false;
    assert.equal(validator.validateShippingAddress(shipping), true);
    assert.equal(addressCalls, 2);
});

test('shipping mixin validates address before method and requests one smooth scroll', () => {
    let active = true;
    let addressValid = false;
    let shippingMethod = null;
    let addressCalls = 0;
    let nativeCalls = 0;
    let stopCalls = 0;
    let errorMessage = 'shipping';
    const events = [];
    const focusOptions = [];
    const scroller = {scrollTop: 400};
    class HTMLElement {
        focus(options) {
            focusOptions.push(options);
        }
    }
    const nativeFocus = HTMLElement.prototype.focus;
    const addressField = new HTMLElement();
    const addressRoot = {contains: (element) => element === addressField};
    const mixin = loadAmd('mixin/shipping-validation-mixin.js', {
        jquery: () => ({stop: () => stopCalls++}),
        'Magento_Checkout/js/model/quote': {shippingMethod: () => shippingMethod},
        'Kkkonrad_Fastcheckout/js/model/one-step-validator': {
            validateShippingAddress() {
                addressCalls += 1;
                scroller.scrollTop = 0;
                addressField.focus();

                return addressValid;
            }
        },
        'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active': () => active
    }, {
        Event: class Event {
            constructor(type) {
                this.type = type;
            }
        },
        document: {
            scrollingElement: scroller,
            documentElement: scroller,
            querySelector: () => addressRoot,
            dispatchEvent(event) {
                events.push(event.type);
            }
        },
        window: {HTMLElement}
    });
    const extension = mixin({extend: (value) => value});

    const component = {
        _super() {
            nativeCalls += 1;
            scroller.scrollTop = 0;

            return false;
        },
        errorValidationMessage(value) {
            errorMessage = value;
        }
    };

    assert.equal(extension.validateShippingInformation.call(component), false);
    assert.equal(addressCalls, 1);
    assert.equal(nativeCalls, 0);
    assert.equal(errorMessage, false);
    assert.equal(scroller.scrollTop, 400);
    assert.deepEqual(events, ['fastcheckout:shipping-validation-failed']);
    assert.equal(focusOptions[0].preventScroll, true);
    assert.equal(HTMLElement.prototype.focus, nativeFocus);

    addressValid = true;
    assert.equal(extension.validateShippingInformation.call(component), false);
    assert.equal(addressCalls, 2);
    assert.equal(nativeCalls, 1);
    assert.equal(scroller.scrollTop, 400);

    shippingMethod = {carrier_code: 'flatrate', method_code: 'flatrate'};
    assert.equal(extension.validateShippingInformation.call(component), false);
    assert.equal(addressCalls, 2);
    assert.equal(nativeCalls, 2);
    assert.equal(stopCalls, 3);

    active = false;
    assert.equal(extension.validateShippingInformation.call(component), false);
    assert.equal(nativeCalls, 3);
    assert.equal(events.length, 3);
});

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
    assert.equal(validator.validateBillingAddress(), false);
    assert.equal(billingUpdates, 1);
    assert.equal(billingAddress, null);
});

test('adopts the native same-as-shipping state restored by billing cancel', () => {
    const shippingAddress = {
        getCacheKey: () => 'shipping',
        getType: () => 'new-customer-address'
    };
    let billingAddress = shippingAddress;
    let sameAsShipping = true;
    const billing = {
        isAddressSameAsShipping(value) {
            if (typeof value === 'undefined') {
                return sameAsShipping;
            }
            sameAsShipping = value;
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

    assert.equal(validator.applyShippingAsBilling(), true);
    assert.equal(billingAddress, shippingAddress);
    assert.equal(sameAsShipping, true);
});

test('registered cross-step validation is a no-op in two-step mode', () => {
    const validator = loadValidator(
        {isVirtual: () => false},
        () => {
            throw new Error('billing address must not be changed');
        },
        {get: () => {
            throw new Error('registry must not be inspected');
        }},
        {window: {checkoutConfig: {fastcheckoutSettings: {twoStep: true}}}}
    );

    assert.equal(validator.validate(), true);
});
