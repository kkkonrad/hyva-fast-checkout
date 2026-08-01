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
            // shippingListChildren used to be registered under a Fastcheckout-only parent and
            // needed aliasing onto the standard path so third-party modules could find them.
            // They are now children of checkout.steps.shipping-step.shippingAddress directly
            // (the stock location), so no aliasing is required for them anymore.
            //
            // shipping-methods.phtml historically bound scope to this Fastcheckout-only name.
            // Alias the real Magento shipping view so any leftover scope lookup still works.
            aliasRegistryComponent(
                'checkout.steps.shipping-step.shippingAddress',
                'fastcheckoutHyvaShippingRenderers.shippingList'
            );
            aliasAdditionalCheckoutStepRegistryPaths();
        }

        function activateDeferredPaymentListChildren(methodCode, rendererComponent) {
            var component = String(rendererComponent || ''),
                isThirdParty = (component !== '' && !/^(Magento_|Kkkonrad_)/.test(component)) ||
                    /paypal|braintree|mollie|payu|tpay|przelewy|stripe/i.test(String(methodCode || '')),
                deferredNames,
                exactFormName,
                hasExactForm,
                provider,
                selectedChildren = {},
                parent;

            if (!isThirdParty || !Object.keys(deferredPaymentListChildren).length || typeof layout !== 'function') {
                return;
            }

            parent = getRegistryItem(scope + '.paymentList');
            if (!parent) {
                return;
            }

            deferredNames = Object.keys(deferredPaymentListChildren);
            exactFormName = String(methodCode || '').toLowerCase() + '-form';
            hasExactForm = deferredNames.some(function (name) {
                return name.toLowerCase() === exactFormName;
            });
            provider = String(methodCode || '').toLowerCase().split(/[_-]/)[0];

            deferredNames.forEach(function (name) {
                var lowerName = name.toLowerCase(),
                    isForm = /-form$/.test(lowerName),
                    matchesProvider = lowerName.indexOf(provider + '-') === 0 ||
                        lowerName.indexOf(provider + '_') === 0;

                if (lowerName === exactFormName || (!isForm && matchesProvider)) {
                    selectedChildren[name] = deferredPaymentListChildren[name];
                }
            });

            // Some gateways use a group renderer code rather than the final method code.
            // In that case load only that provider's forms; unknown layouts retain the old fallback.
            if (!hasExactForm) {
                deferredNames.forEach(function (name) {
                    var lowerName = name.toLowerCase();

                    if (
                        lowerName.indexOf(provider + '-') === 0 ||
                        lowerName.indexOf(provider + '_') === 0
                    ) {
                        selectedChildren[name] = deferredPaymentListChildren[name];
                    }
                });
            }
            if (!Object.keys(selectedChildren).length) {
                deferredNames.forEach(function (name) {
                    selectedChildren[name] = deferredPaymentListChildren[name];
                });
            }

            layout(selectedChildren, parent);
            Object.keys(selectedChildren).forEach(function (name) {
                delete deferredPaymentListChildren[name];
            });
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
