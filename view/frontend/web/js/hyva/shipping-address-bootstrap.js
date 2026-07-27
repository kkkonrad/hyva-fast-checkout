define([
    'jquery',
    'Magento_Ui/js/core/app',
    'Magento_Ui/js/core/renderer/layout',
    'uiRegistry',
    'Kkkonrad_Fastcheckout/js/hyva/checkout-layout-bridge'
], function ($, app, uiLayout, registry, createCheckoutLayoutBridge) {
    'use strict';

    return function (config) {
        if (window.fastcheckoutShippingComponentsStarted) {
            return;
        }

        var scope = config.scope || 'fastcheckoutHyvaPaymentRenderers',
            checkoutLayoutBridge = createCheckoutLayoutBridge({
                config: config,
                registry: registry,
                layout: uiLayout,
                scope: scope
            }),
            observer,
            readinessTimer,
            attempts = 0;

        function announceAddressFieldsReady() {
            var firstName = document.querySelector(
                '.fastcheckout-native-shipping-address input[name="firstname"]'
            );

            if (!firstName || window.fastcheckoutAddressFieldsReady) {
                return !!firstName;
            }

            window.fastcheckoutAddressFieldsReady = true;
            window.dispatchEvent(new CustomEvent('fastcheckout:address-fields-ready'));

            return true;
        }

        function stopReadinessWatch() {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            if (readinessTimer) {
                window.clearTimeout(readinessTimer);
                readinessTimer = null;
            }
        }

        function pollAddressFields() {
            attempts += 1;
            if (announceAddressFieldsReady()) {
                stopReadinessWatch();
                return;
            }
            if (attempts < 80) {
                readinessTimer = window.setTimeout(pollAddressFields, 100);
            }
        }

        window.fastcheckoutShippingComponentsStarted = true;
        window.fastcheckoutShippingComponentsStartedAt = performance.now();

        observer = new MutationObserver(function () {
            if (announceAddressFieldsReady()) {
                stopReadinessWatch();
            }
        });
        observer.observe(
            document.querySelector('.fastcheckout-native-shipping-address') || document.body,
            { childList: true, subtree: true }
        );
        readinessTimer = window.setTimeout(pollAddressFields, 100);

        app({
            components: {
                'checkoutProvider': $.extend(
                    true,
                    {
                        component: 'uiComponent',
                        shippingAddress: {
                            street: ['', '']
                        }
                    },
                    checkoutLayoutBridge.checkoutProvider
                ),
                'checkout': {
                    component: 'uiComponent',
                    children: {
                        steps: {
                            component: 'uiComponent',
                            children: $.extend(true, {}, checkoutLayoutBridge.checkoutStepChildren, {
                                'shipping-step': {
                                    component: 'uiComponent',
                                    children: {
                                        'step-config': {
                                            component: 'uiComponent'
                                        },
                                        shippingAddress: $.extend(
                                            true,
                                            {},
                                            checkoutLayoutBridge.shippingAddress,
                                            {
                                                children: $.extend(
                                                    true,
                                                    {},
                                                    checkoutLayoutBridge.shippingAddressChildren,
                                                    checkoutLayoutBridge.shippingListChildren
                                                )
                                            }
                                        )
                                    }
                                }
                            })
                        }
                    }
                }
            }
        });
    };
});
