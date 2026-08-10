'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('renders automatic agreements as checked disabled checkboxes', () => {
    let mixin,
        closeHandler,
        dispatchedEvent;
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../view/frontend/web/js/mixin/checkout-agreements-mixin.js'),
        'utf8'
    );
    const automatic = input('1');
    const manual = input('2');
    const root = {
        querySelectorAll() {
            return [automatic, manual];
        }
    };
    const modal = {
        nodeType: 1,
        closest(selector) {
            return selector === '.agreements-modal' ? modalWrapper : root;
        }
    };
    const modalWrapper = {
        attributes: {},
        classList: {
            contains() {
                return false;
            }
        },
        hasAttribute(name) {
            return Object.hasOwn(this.attributes, name);
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        addEventListener(name, handler) {
            if (name === 'click') {
                closeHandler = handler;
            }
        },
        dispatchEvent(event) {
            dispatchedEvent = event.type;
        }
    };

    vm.runInNewContext(source, {
        Event: class Event {
            constructor(type) {
                this.type = type;
            }
        },
        window: {
            setTimeout(callback) {
                callback();
            }
        },
        define(dependencies, factory) {
            mixin = factory()({
                extend(extension) {
                    return extension;
                }
            });
        }
    });

    const elements = [{nodeType: 3}, modal];
    let superArgument;
    const component = Object.assign({
        agreements: [
            {agreementId: 1, mode: '0'},
            {agreementId: 2, mode: '1'}
        ],
        _super(value) {
            superArgument = value;
        }
    }, mixin);

    component.initModal(elements);

    assert.equal(component.isAgreementRequired(), true);
    assert.equal(superArgument, elements);
    assert.equal(automatic.checked, true);
    assert.equal(automatic.disabled, true);
    assert.equal(automatic.attributes['aria-disabled'], 'true');
    assert.equal(automatic.attributes['data-fastcheckout-automatic-agreement'], '1');
    assert.equal(automatic.required, false);
    assert.equal(manual.checked, false);
    assert.equal(manual.disabled, false);
    closeHandler({
        target: {
            closest() {
                return {};
            }
        }
    });
    assert.equal(dispatchedEvent, 'transitionend');
});

function input(value) {
    const element = {
        value,
        checked: false,
        disabled: false,
        required: true,
        attributes: {},
        setAttribute(name, attributeValue) {
            this.attributes[name] = attributeValue;
        }
    };

    element.classList = {
        remove() {
            element.required = false;
        }
    };

    return element;
}
