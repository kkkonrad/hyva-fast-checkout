define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/select-billing-address',
    'uiRegistry'
], function ($, quote, selectBillingAddress, registry) {
    'use strict';

    var paymentPath = 'checkout.steps.billing-step.payment',
        billingFollowsShipping = true;

    function getBillingAddressComponent() {
        var components = getBillingAddressComponents();

        return components.length ? components[0] : null;
    }

    function getBillingAddressComponents() {
        var method = quote.paymentMethod && quote.paymentMethod(),
            code = method && method.method ? String(method.method) : '',
            names = [paymentPath + '.afterMethods.billing-address-form'],
            components = [];

        if (code) {
            names.unshift(paymentPath + '.payments-list.' + code + '-form');
        }

        names.forEach(function (name) {
            var component = registry.get(name);

            if (component && components.indexOf(component) === -1) {
                components.push(component);
            }
        });

        return components;
    }

    function setBillingFollowsShipping(follows) {
        billingFollowsShipping = follows !== false;
    }

    function doesBillingFollowShipping() {
        return billingFollowsShipping;
    }

    function addressesShareCacheKey(left, right) {
        return Boolean(
            left && right &&
            typeof left.getCacheKey === 'function' &&
            typeof right.getCacheKey === 'function' &&
            left.getCacheKey() === right.getCacheKey()
        );
    }

    function syncBillingComponent(component, billingAddress, shippingAddress) {
        var sameAsShipping;

        if (!component) {
            return;
        }

        sameAsShipping = billingFollowsShipping &&
            addressesShareCacheKey(billingAddress, shippingAddress);

        if (typeof component.isAddressSameAsShipping === 'function' &&
            component.isAddressSameAsShipping() !== sameAsShipping) {
            component.isAddressSameAsShipping(sameAsShipping);
        }

        if (billingAddress &&
            typeof component.isAddressDetailsVisible === 'function' &&
            !component.isAddressDetailsVisible()) {
            component.isAddressDetailsVisible(true);
        }
    }

    function applyShippingAsBilling() {
        var shippingAddress = quote.shippingAddress && quote.shippingAddress(),
            billingAddress = quote.billingAddress && quote.billingAddress();

        if (quote.isVirtual && quote.isVirtual()) {
            return Boolean(quote.billingAddress && quote.billingAddress());
        }

        if (billingFollowsShipping && shippingAddress &&
            !addressesShareCacheKey(billingAddress, shippingAddress)) {
            selectBillingAddress(shippingAddress);
            billingAddress = quote.billingAddress && quote.billingAddress();
        }

        getBillingAddressComponents().forEach(function (component) {
            syncBillingComponent(component, billingAddress, shippingAddress);
        });

        return Boolean(quote.billingAddress && quote.billingAddress());
    }

    function validateShippingInformation() {
        var shipping;

        if (quote.isVirtual && quote.isVirtual()) {
            return true;
        }

        shipping = registry.get('checkout.steps.shipping-step.shippingAddress');

        if (
            shipping &&
            (!quote.shippingMethod || !quote.shippingMethod()) &&
            !validateShippingAddress(shipping)
        ) {
            return false;
        }

        return Boolean(
            shipping &&
            typeof shipping.validateShippingInformation === 'function' &&
            shipping.validateShippingInformation()
        );
    }

    function validateShippingAddress(shipping) {
        var email = $('form[data-role=email-with-possible-login] input[name=username]'),
            emailValid = true;

        if (
            shipping.isFormInline === false ||
            !shipping.source ||
            typeof shipping.triggerShippingDataValidateEvent !== 'function'
        ) {
            return true;
        }

        shipping.source.set('params.invalid', false);
        shipping.triggerShippingDataValidateEvent();

        if (email.length) {
            email.closest('form').validation();
            emailValid = Boolean(email.valid());
        }

        if (shipping.source.get('params.invalid') || !emailValid) {
            if (typeof shipping.focusInvalid === 'function') {
                shipping.focusInvalid();
            }
            if (!emailValid) {
                email.trigger('focus');
            }

            return false;
        }

        return true;
    }

    function validateBillingAddress() {
        var component;

        if (billingFollowsShipping) {
            return applyShippingAsBilling();
        }

        if (quote.billingAddress && quote.billingAddress()) {
            return true;
        }

        component = getBillingAddressComponent();

        if (component && typeof component.updateAddress === 'function') {
            component.updateAddress();
        }

        return Boolean(quote.billingAddress && quote.billingAddress());
    }

    return {
        getBillingAddressComponent: getBillingAddressComponent,
        setBillingFollowsShipping: setBillingFollowsShipping,
        doesBillingFollowShipping: doesBillingFollowShipping,
        applyShippingAsBilling: applyShippingAsBilling,
        validateShippingInformation: validateShippingInformation,
        validateBillingAddress: validateBillingAddress,
        validate: function () {
            return validateShippingInformation() && validateBillingAddress();
        }
    };
});
