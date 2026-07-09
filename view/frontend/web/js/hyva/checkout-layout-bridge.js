define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            registry = deps.registry,
            paymentListChildren = $.extend(true, {}, config.paymentListChildren || {}),
            paymentRegionChildren = $.extend(true, {}, config.paymentRegionChildren || {}),
            shippingListChildren = $.extend(true, {}, config.shippingListChildren || {}),
            shippingAddressChildren = $.extend(true, {}, config.shippingAddressChildren || {}),
            checkoutStepChildren = $.extend(true, {}, config.checkoutStepChildren || {});

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

        return {
            paymentListChildren: paymentListChildren,
            paymentRegionChildren: paymentRegionChildren,
            shippingListChildren: shippingListChildren,
            shippingAddressChildren: shippingAddressChildren,
            checkoutStepChildren: checkoutStepChildren,
            aliasAdditionalCheckoutStepRegistryPaths: aliasAdditionalCheckoutStepRegistryPaths,
            aliasStandardShippingRegistryPaths: aliasStandardShippingRegistryPaths
        };
    };
});
