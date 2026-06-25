define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        if (window.console && typeof window.console.log === 'function') {
            window.console.log('IWD OPC: payment-renderers JS initialized with config:', config);
        }
        var scope = config.scope || 'iwdOpcHyvaPaymentRenderers',
            rendererComponents = config.rendererComponents || [];

        window.checkoutConfig = config.checkoutConfig || {};
        window.checkoutConfig.payment = window.checkoutConfig.payment || {};
        window.checkoutConfig.payment.payuGateway = window.checkoutConfig.payment.payuGateway || {isActive: false};
        window.checkoutConfig.payment.payuGatewayCard = window.checkoutConfig.payment.payuGatewayCard || {isActive: false};
        window.checkoutConfig.payment.payuConfig = window.checkoutConfig.payment.payuConfig || {payMethods: {}};
        
        window.isCustomerLoggedIn = window.checkoutConfig.isCustomerLoggedIn;
        window.customerData = window.checkoutConfig.customerData;
        rendererComponents = rendererComponents.filter(function (component) {
            var paymentConfig = window.checkoutConfig.payment;

            if (component.indexOf('PayU_PaymentGateway/') === 0) {
                return !!(paymentConfig.payuGateway || paymentConfig.payuGatewayCard || paymentConfig.payuConfig);
            }

            if (component.indexOf('Tpay_Magento2/') === 0) {
                return !!(window.checkoutConfig.tpay || window.checkoutConfig.generic || window.checkoutConfig.tpaycards);
            }

            return true;
        });

        require([
            'Magento_Ui/js/core/app',
            'Magento_Checkout/js/model/payment-service',
            'Magento_Checkout/js/model/payment/method-converter',
            'Magento_Checkout/js/model/payment/method-list',
            'Magento_Checkout/js/model/quote',
            'Magento_Checkout/js/action/select-payment-method',
            'uiRegistry',
            'Magento_Customer/js/customer-data'
        ], function (
            app,
            paymentService,
            methodConverter,
            methodList,
            quote,
            selectPaymentMethodAction,
            registry,
            customerData
        ) {
            function loadRendererComponents(done) {
                var remaining = rendererComponents.length;

                if (!remaining) {
                    done();
                    return;
                }

                rendererComponents.forEach(function (component) {
                    require([component], function () {
                        remaining -= 1;
                        if (remaining === 0) {
                            done();
                        }
                    }, function (error) {
                        remaining -= 1;
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('IWD OPC: payment renderer could not be loaded', component, error);
                        }
                        if (remaining === 0) {
                            done();
                        }
                    });
                });
            }

            loadRendererComponents(function () {
                // Initialize customerData if not already initialized
                if (customerData && typeof customerData['Magento_Customer/js/customer-data'] === 'function') {
                    var customerDataConfig = window.checkoutConfig.customerData || {
                        cookieLifeTime: '3600',
                        expirableSectionNames: ['cart'],
                        expirableSectionLifetime: 60,
                        cookieDomain: '',
                        isLoggedIn: window.isCustomerLoggedIn
                    };
                    try {
                        customerData['Magento_Customer/js/customer-data'](customerDataConfig);
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('IWD OPC: customerData initialized successfully');
                        }
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('IWD OPC: customerData initialization error:', e);
                        }
                    }
                }

                var lastMethodsJson = '';

                function syncPaymentMethods() {
                    var methods = [];
                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        var label = input.closest('label');
                        var titleElement = label ? label.querySelector('span') : null;
                        methods.push({
                            method: input.value,
                            title: titleElement ? titleElement.textContent.trim() : ''
                        });
                    });

                    var currentMethodsJson = JSON.stringify(methods);
                    if (currentMethodsJson === lastMethodsJson) {
                        return;
                    }
                    lastMethodsJson = currentMethodsJson;

                    if (window.console && typeof window.console.log === 'function') {
                        window.console.log('IWD OPC: syncPaymentMethods found methods:', methods);
                    }

                    if (methods.length > 0) {
                        paymentService.setPaymentMethods(methods);
                    } else {
                        var fallbackMethods = methodConverter(config.paymentMethods || window.checkoutConfig.paymentMethods || []);
                        paymentService.setPaymentMethods(fallbackMethods);
                    }
                }

                syncPaymentMethods();

                app({
                    components: {
                        [scope]: {
                            component: 'uiComponent',
                            children: {
                                paymentList: {
                                    component: 'IWD_Opc/js/hyva/payment-list',
                                    displayArea: 'payment-methods-list'
                                }
                            }
                        }
                    }
                });

                function getSelectedMethodCode() {
                    var selected = document.querySelector('input[name="payment_method"]:checked');

                    return selected ? selected.value : '';
                }

                function getMethod(methodCode) {
                    return methodList().filter(function (method) {
                        return method.method === methodCode;
                    })[0] || null;
                }

                function getRendererByMethod(methodCode) {
                    var found = null;

                    registry.get(function (component) {
                        var rendererCode;

                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        rendererCode = typeof component.getCode === 'function' ? component.getCode() : '';

                        if (component.item.method === methodCode || rendererCode === methodCode) {
                            found = component;
                        }
                    });

                    return found;
                }

                function getRendererCode(component, fallbackCode) {
                    var rendererCode = component && typeof component.getCode === 'function' ? component.getCode() : '';

                    return rendererCode || fallbackCode;
                }

                function patchRenderer(component) {
                    if (!component || component.iwdOpcHyvaPatched) {
                        return;
                    }

                    component.iwdOpcHyvaPatched = true;
                    component.selectPaymentMethod = function () {
                        var paymentData = typeof component.getData === 'function'
                                ? component.getData()
                                : {method: component.item ? component.item.method : null},
                            rendererCode = getRendererCode(component, paymentData.method);

                        if (paymentData && paymentData.method) {
                            selectPaymentMethodAction(paymentData);
                            quote.paymentMethod({
                                method: rendererCode,
                                title: component.item ? component.item.title : null
                            });
                        }

                        return true;
                    };
                }

                function patchRenderers() {
                    registry.get(function (component) {
                        if (component && component.item && component.item.method) {
                            patchRenderer(component);
                        }
                    });
                }

                function elementMatchesMethod(element, methodCode, activeCode) {
                    var inputs = element.querySelectorAll('input'),
                        matches = false;

                    if (element.id === methodCode || element.id === activeCode) {
                        return true;
                    }

                    inputs.forEach(function (input) {
                        if (matches) {
                            return;
                        }

                        matches = input.id === methodCode ||
                            input.id === activeCode ||
                            input.value === methodCode ||
                            input.value === activeCode ||
                            input.getAttribute('value') === methodCode ||
                            input.getAttribute('value') === activeCode;
                    });

                    return matches;
                }

                function updateActiveRendererClass(methodCode, activeCode) {
                    var root = document.getElementById('iwd-opc-ko-payment-root'),
                        activeElement = null;

                    if (!root) {
                        return false;
                    }

                    var allRenderers = document.querySelectorAll('.payment-method');

                    allRenderers.forEach(function (element) {
                        element.classList.remove('_active');
                        element.removeAttribute('data-iwd-active');
                    });

                    allRenderers.forEach(function (element) {
                        if (!activeElement && elementMatchesMethod(element, methodCode, activeCode)) {
                            activeElement = element;
                        }
                    });

                    if (activeElement) {
                        activeElement.classList.add('_active');
                        activeElement.setAttribute('data-iwd-active', 'true');

                        var target = document.querySelector('[data-iwd-payment-method-ko-target="' + methodCode + '"]');
                        if (target) {
                            // Hide all other placeholders
                            document.querySelectorAll('.iwd-opc-payment-method-ko-container').forEach(function (placeholder) {
                                placeholder.classList.add('hidden');
                                placeholder.style.display = 'none';
                            });

                            target.appendChild(activeElement);
                            target.classList.remove('hidden');
                            target.style.display = 'block';
                        }
                    }

                    return !!activeElement;
                }

                function applySelectedMethod(methodCode) {
                    var method,
                        renderer,
                        activeCode,
                        activeMethod;

                    if (!methodCode) {
                        return false;
                    }

                    method = getMethod(methodCode) || {method: methodCode};
                    selectPaymentMethodAction(method);
                    patchRenderers();
                    renderer = getRendererByMethod(methodCode);
                    patchRenderer(renderer);
                    activeCode = getRendererCode(renderer, methodCode);
                    activeMethod = getMethod(activeCode) || {method: activeCode, title: method.title};
                    quote.paymentMethod(activeMethod);
                    if (renderer && typeof renderer.selectPaymentMethod === 'function') {
                        renderer.selectPaymentMethod();
                    }
                    return updateActiveRendererClass(methodCode, activeCode);
                }

                function setSelectedMethod(methodCode) {
                    if (!methodCode) {
                        return;
                    }

                    applySelectedMethod(methodCode);

                    [50, 150, 350, 750].forEach(function (delay) {
                        window.setTimeout(function () {
                            applySelectedMethod(methodCode);
                        }, delay);
                    });
                }


                function getActiveRenderer() {
                    var selectedMethod = getSelectedMethodCode(),
                        found = null;

                    registry.get(function (component) {
                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        if (
                            typeof component.getData === 'function' &&
                            (component.item.method === selectedMethod ||
                                (typeof component.getCode === 'function' && component.getCode() === selectedMethod))
                        ) {
                            found = component;
                        }
                    });

                    return found;
                }

                window.iwdOpcHyvaPayment = {
                    getActivePaymentData: function () {
                        var component = getActiveRenderer();

                        if (component && typeof component.getData === 'function') {
                            return component.getData();
                        }

                        return {
                            method: getSelectedMethodCode(),
                            additional_data: {}
                        };
                    },

                    syncPaymentData: function (wire) {
                        var paymentData = this.getActivePaymentData(),
                            additionalData = paymentData.additional_data || {};

                        if (!wire || typeof wire.set !== 'function') {
                            return Promise.resolve();
                        }

                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData));
                    },

                    selectPaymentMethod: setSelectedMethod
                };

                patchRenderers();
                setSelectedMethod(getSelectedMethodCode());

                document.addEventListener('change', function (event) {
                    if (event.target && event.target.name === 'payment_method') {
                        setSelectedMethod(event.target.value);
                    }
                });

                document.addEventListener('click', function (event) {
                    var option = event.target ? event.target.closest('[data-iwd-opc-payment-option]') : null,
                        input;

                    if (event.target && event.target.name === 'payment_method') {
                        setSelectedMethod(event.target.value);
                        return;
                    }

                    if (option) {
                        input = option.querySelector('input[name="payment_method"]');
                        if (input) {
                            setSelectedMethod(input.value);
                        }
                    }
                }, true);

                function moveRenderersBackToRoot() {
                    var root = document.getElementById('iwd-opc-ko-payment-root');
                    if (root) {
                        document.querySelectorAll('.payment-method').forEach(function (element) {
                            if (element.parentNode !== root) {
                                root.appendChild(element);
                            }
                        });
                    }
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('message.sent', function () {
                        moveRenderersBackToRoot();
                    });
                    window.Livewire.hook('message.processed', function () {
                        if (window.console && typeof window.console.log === 'function') {
                            window.console.log('IWD OPC: Livewire message.processed triggered');
                        }
                        syncPaymentMethods();
                        patchRenderers();
                        setSelectedMethod(getSelectedMethodCode());
                    });
                }

            });
        });
    };
});
