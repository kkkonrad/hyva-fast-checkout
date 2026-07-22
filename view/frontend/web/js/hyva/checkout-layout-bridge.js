define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            registry = deps.registry,
            layout = deps.layout,
            scope = deps.scope || 'fastcheckoutHyvaPaymentRenderers',
            paymentListChildren = $.extend(true, {}, config.paymentListChildren || {}),
            deferredPaymentListChildren = {},
            paymentRegionChildren = $.extend(true, {}, config.paymentRegionChildren || {}),
            shippingListChildren = $.extend(true, {}, config.shippingListChildren || {}),
            shippingAddressChildren = $.extend(true, {}, config.shippingAddressChildren || {}),
            shippingAddress = $.extend(true, {}, config.shippingAddress || {}),
            checkoutProvider = $.extend(true, {}, config.checkoutProvider || {}),
            checkoutStepChildren = $.extend(true, {}, config.checkoutStepChildren || {});

        function containsDeferredPaymentComponent(name, node) {
            var serialized = name + ' ' + JSON.stringify(node || {});

            return /paypal|braintree|mollie|payu|tpay|przelewy|stripe/i.test(serialized);
        }

        Object.keys(paymentListChildren).forEach(function (name) {
            if (containsDeferredPaymentComponent(name, paymentListChildren[name])) {
                deferredPaymentListChildren[name] = paymentListChildren[name];
                delete paymentListChildren[name];
            }
        });

        paymentRegionChildren.paymentList = {
            component: 'Kkkonrad_Fastcheckout/js/hyva/payment-list',
            displayArea: 'payment-methods-list',
            children: paymentListChildren
        };

        function getRegistryItem(name) {
            try {
                return registry.get(name);
            } catch (error) {
                return null;
            }
        }

        function aliasRegistryComponent(sourceName, targetName) {
            var source;

            if (getRegistryItem(targetName)) {
                return;
            }

            source = getRegistryItem(sourceName);
            if (source) {
                registry.set(targetName, source);
            }
        }

        function aliasConfiguredComponentTree(children, sourcePrefix, targetPrefix) {
            Object.keys(children || {}).forEach(function (childName) {
                var sourceName = sourcePrefix + '.' + childName,
                    targetName = targetPrefix + '.' + childName,
                    child = children[childName] || {};

                aliasRegistryComponent(sourceName, targetName);
                if (child.children) {
                    aliasConfiguredComponentTree(child.children, sourceName, targetName);
                }
            });
        }

        function aliasAdditionalCheckoutStepRegistryPaths() {
            Object.keys(checkoutStepChildren || {}).forEach(function (stepName) {
                var component = getRegistryItem('checkout.steps.' + stepName) ||
                    getRegistryItem('index = ' + stepName);

                if (component) {
                    registry.set('checkout.steps.' + stepName, component);
                }

                aliasConfiguredComponentTree(
                    checkoutStepChildren[stepName] && checkoutStepChildren[stepName].children || {},
                    'checkout.steps.' + stepName,
                    'checkout.steps.' + stepName
                );
            });
        }

        function aliasStandardShippingRegistryPaths() {
            aliasConfiguredComponentTree(
                shippingListChildren,
                'fastcheckoutHyvaShippingRenderers.shippingList',
                'checkout.steps.shipping-step.shippingAddress'
            );
            aliasAdditionalCheckoutStepRegistryPaths();
        }

        function activateDeferredPaymentListChildren(methodCode, rendererComponent) {
            var component = String(rendererComponent || ''),
                isThirdParty = (component !== '' && !/^(Magento_|Kkkonrad_)/.test(component)) ||
                    /paypal|braintree|mollie|payu|tpay|przelewy|stripe/i.test(String(methodCode || '')),
                parent;

            if (!isThirdParty || !Object.keys(deferredPaymentListChildren).length || typeof layout !== 'function') {
                return;
            }

            parent = getRegistryItem(scope + '.paymentList');
            if (!parent) {
                return;
            }

            layout(deferredPaymentListChildren, parent);
            deferredPaymentListChildren = {};
        }

        return {
            paymentListChildren: paymentListChildren,
            paymentRegionChildren: paymentRegionChildren,
            shippingListChildren: shippingListChildren,
            shippingAddressChildren: shippingAddressChildren,
            shippingAddress: shippingAddress,
            checkoutProvider: checkoutProvider,
            checkoutStepChildren: checkoutStepChildren,
            activateDeferredPaymentListChildren: activateDeferredPaymentListChildren,
            aliasAdditionalCheckoutStepRegistryPaths: aliasAdditionalCheckoutStepRegistryPaths,
            aliasStandardShippingRegistryPaths: aliasStandardShippingRegistryPaths
        };
    };
});
