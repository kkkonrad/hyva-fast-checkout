/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'mage/utils/wrapper',
    'braintreeHostedFields'
], function (wrapper,hostedFields) {
    'use strict';

    var mixin = {
        setupHostedFields: function () {
            var self = this;

            if (this.hostedFieldsInstance) {
                this.hostedFieldsInstance.teardown(function () {
                    this.hostedFieldsInstance = null;
                    this.setupHostedFields();
                }.bind(this));
                return;
            }

            hostedFields.create({
                client: this.clientInstance,
                fields: this.config.hostedFields,
                styles: {
                    "input": {
                        "font-size": "14px",
                        "color": "#3A3A3A"
                    },
                    ":focus": {
                        "color": "black"
                    },
                    ".valid": {
                        "color": "green"
                    },
                    ".invalid": {
                        "color": "red"
                    }
                }
            }, function (createErr, hostedFieldsInstance) {
                if (createErr) {
                    self.showError($t("Braintree hosted fields could not be initialized. Please contact the store owner."));
                    console.error('Braintree hosted fields error', createErr);
                    return;
                }

                this.config.onInstanceReady(hostedFieldsInstance);
                this.hostedFieldsInstance = hostedFieldsInstance;
            }.bind(this));
        },
    };

    /**
     * Override default getShippingMethodTitle
     */
    return function (target) {
        return wrapper.extend(target, mixin);
    };
});