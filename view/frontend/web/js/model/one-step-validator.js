define([
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/select-billing-address',
    'uiRegistry'
], function (quote, selectBillingAddress, registry) {
    'use strict';

    var paymentPath = 'checkout.steps.billing-step.payment';

    function getBillingAddressComponent() {
        var method = quote.paymentMethod && quote.paymentMethod(),
            code = method && method.method ? String(method.method) : '',
            component = code ? registry.get(
                paymentPath + '.payments-list.' + code + '-form'
            ) : null;

        return component || registry.get(
            paymentPath + '.afterMethods.billing-address-form'
        );
    }

    function validateShippingInformation() {
        var shipping;

        if (quote.isVirtual && quote.isVirtual()) {
            return true;
        }

        shipping = registry.get('checkout.steps.shipping-step.shippingAddress');

        return Boolean(
            shipping &&
            typeof shipping.validateShippingInformation === 'function' &&
            shipping.validateShippingInformation()
        );
    }

    function validateBillingAddress() {
        var component = getBillingAddressComponent(),
            shippingAddress = quote.shippingAddress && quote.shippingAddress();

        if (quote.billingAddress && quote.billingAddress()) {
            return true;
        }

        if (!component) {
            return false;
        }

        if (
            !quote.isVirtual() &&
            shippingAddress &&
            component.isAddressSameAsShipping &&
            component.isAddressSameAsShipping()
        ) {
            selectBillingAddress(shippingAddress);
        } else if (typeof component.updateAddress === 'function') {
            component.updateAddress();
        }

        return Boolean(quote.billingAddress && quote.billingAddress());
    }

    return {
        getBillingAddressComponent: getBillingAddressComponent,
        validateShippingInformation: validateShippingInformation,
        validateBillingAddress: validateBillingAddress,
        validate: function () {
            return validateShippingInformation() && validateBillingAddress();
        }
    };
});
