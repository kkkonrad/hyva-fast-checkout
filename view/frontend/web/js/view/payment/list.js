var defineArray = [
    'jquery',
    'underscore',
    'ko',
    'mageUtils',
    'uiComponent',
    'Magento_Checkout/js/model/payment/method-list',
    'Magento_Checkout/js/model/payment/renderer-list',
    'uiLayout',
    'Magento_Checkout/js/model/checkout-data-resolver',
    'mage/translate',
    'uiRegistry',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/select-payment-method',
    'Magento_Checkout/js/checkout-data',
    'Magento_Checkout/js/model/error-processor',
    'Magento_Checkout/js/model/url-builder',
    'Magento_Checkout/js/model/full-screen-loader',
    'mage/storage',
];

// Use AmazonPayStorage Script if AmazonPay is enabled
var amazonPayEnabled = false;
if (typeof(window.amazonPayment) !== "undefined") {
    amazonPayEnabled = true;
    defineArray.push('Amazon_Payment/js/model/storage');
}

define(defineArray,
    function (
        $,
        _,
        ko,
        utils,
        Component,
        paymentMethods,
        rendererList,
        layout,
        checkoutDataResolver,
        $t,
        registry,
        quote,
        selectPaymentMethodAction,
        checkoutData,
        errorProcessor,
        urlBuilder,
        fullScreenLoader,
        storage,
        amazonStorage) {

    amazonStorage = amazonStorage || null;

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/payment-methods/custom-payment-list',
            visible: paymentMethods().length > 0,
            configDefaultGroup: {
                name: 'methodGroup',
                component: 'Magento_Checkout/js/model/payment/method-group'
            },
            paymentGroupsList: ko.observable([]),
            defaultGroupTitle: $t('Select a new payment method'),
            paymentRenderersMap: {
                iwd_saved_credit_card: 'IWD_Opc/js/view/payment/methods-renderers/iwd_saved_credit_card',
                free: 'IWD_Opc/js/view/payment/methods-renderers/free-method',
                checkmo: 'IWD_Opc/js/view/payment/methods-renderers/checkmo-method',
                banktransfer: 'IWD_Opc/js/view/payment/methods-renderers/banktransfer-method',
                cashondelivery: 'IWD_Opc/js/view/payment/methods-renderers/cashondelivery-method',
                purchaseorder: 'IWD_Opc/js/view/payment/methods-renderers/purchaseorder-method',
                braintree_paypal: 'IWD_Opc/js/view/payment/methods-renderers/paypal',
                braintree: 'IWD_Opc/js/view/payment/methods-renderers/braintree/hosted-fields',
                authorizenet_directpost: 'IWD_Opc/js/view/payment/methods-renderers/authorizenet-directpost',
                paypal_express_bml: 'IWD_Opc/js/view/payment/methods-renderers/paypal-express-bml',

                paypal_express: (window.checkoutConfig.payment.paypalExpress && window.checkoutConfig.payment.paypalExpress.isContextCheckout) ?
                    'IWD_Opc/js/view/payment/methods-renderers/in-context/checkout-express' : 'IWD_Opc/js/view/payment/methods-renderers/paypal-express',

                eway: (window.checkoutConfig.payment.eway && window.checkoutConfig.payment.eway.connectionType) ?
                    'IWD_Opc/js/view/payment/methods-renderers/eway/' + window.checkoutConfig.payment.eway.connectionType : '',

                iwd_authcim: (window.checkoutConfig.payment.iwd_authcim && window.checkoutConfig.payment.iwd_authcim.isAcceptjsEnabled) ?
                    'IWD_Opc/js/view/payment/methods-renderers/iwd_authcim/acceptjs' : 'IWD_Opc/js/view/payment/methods-renderers/iwd_authcim/iframe',

                worldpay: 'IWD_Opc/js/view/payment/methods-renderers/worldpay',
                cybersource: 'IWD_Opc/js/view/payment/methods-renderers/cybersource',

                payflow_express_bml: 'IWD_Opc/js/view/payment/methods-renderers/payflow-express-bml',
                payflow_express: 'IWD_Opc/js/view/payment/methods-renderers/payflow-express',
                payflow_link: 'IWD_Opc/js/view/payment/methods-renderers/iframe-methods',
                payflow_advanced: 'IWD_Opc/js/view/payment/methods-renderers/iframe-methods',
                hosted_pro: 'IWD_Opc/js/view/payment/methods-renderers/iframe-methods',
                payflowpro: 'IWD_Opc/js/view/payment/methods-renderers/payflowpro-method',
                paypal_billing_agreement: 'IWD_Opc/js/view/payment/methods-renderers/paypal-billing-agreement',

                iwd_applepay: 'IWD_Opc/js/view/payment/methods-renderers/apple_pay',
                opg_square: 'IWD_Opc/js/view/payment/methods-renderers/opg_square'
            },
            paymentImagesMap: {
                braintree_paypal: 'paypal',
                braintree_paypal_vault: 'paypal',

                iwd_applepay: 'apple_pay',

                paypal_express: 'paypal',
                paypal_express_bml: 'paypal',
                payflow_express: 'paypal',
                payflow_express_bml: 'paypal',

                paypal_billing_agreement: 'paypal',

                payflow_link: 'paypal',
                hosted_pro: 'paypal',
                payflow_advanced: 'paypal'
            }
        },
        selectedPaymentMethod: ko.observable(function () {
            return quote.paymentMethod() ? quote.paymentMethod().method : null
        }),
        paymentMethods: ko.observableArray(),
        optionsRenderCallback: 0,

        decorateSelect: function (uid, option, item) {
            clearTimeout(this.optionsRenderCallback);
            if (option && item) {
                if (item.image) {
                    $(option).attr('data-image', item.image);
                }
                if (item.cc_types) {
                    $(option).attr('data-cc-types', item.cc_types);
                }
            }
            this.optionsRenderCallback = setTimeout(function () {
                var select = $('#' + uid);
                if (select.length) {
                    //select.decorateSelectCustom();
                }
            }, 0);
        },
        /**
         * Initialize view.
         *
         * @returns {Component} Chainable.
         */
        initialize: function () {
            this._super().initDefaultGroup().initChildren();
            paymentMethods.subscribe(function (methods) {
                checkoutDataResolver.resolvePaymentMethod();
            });

            paymentMethods.subscribe(
                function (changes) {
                    //remove renderer for "deleted" payment methods
                    _.each(changes, function (change) {
                        if (change.status === 'deleted') {
                            var addedAfterDeleted = _.filter(changes, function (methodChange) {
                                return methodChange.status === 'added' && methodChange.value.method === change.value.method;
                            });
                            if (!addedAfterDeleted.length) {
                                this.removeRenderer(change.value.method);
                            }
                        }
                    }, this);
                    //add renderer for "added" payment methods
                    _.each(changes, function (change) {
                        if (change.status === 'added') {
                            var wasRendered = _.filter(changes, function (methodChange) {
                                return methodChange.status === 'deleted' && methodChange.value.method === change.value.method;
                            });
                            if (!wasRendered.length) {
                                this.createRenderer(change.value);
                            }
                        }
                    }, this);
                }, this, 'arrayChange');

            quote.paymentMethod.subscribe(function (method) {
                if (method) {
                    this.selectedPaymentMethod(method.method);
                } else {
                    this.selectedPaymentMethod(null);
                }
                $('#iwd_opc_payment_method_select').trigger('change');
            }, this);

            return this;
        },

        selectPaymentMethod: function (obj, event, method) {
            if (!!event.originalEvent) {
                if (method) {
                    // Return to standart checkout if on Amazon Pay OPC page
                    if (amazonPayEnabled) {
                        if (amazonStorage.isAmazonAccountLoggedIn() && method !== 'amazon_payment') {
                            var serviceUrl = urlBuilder.createUrl('/amazon/order-ref', {});

                            fullScreenLoader.startLoader();
                            storage.delete(
                                serviceUrl
                            ).done(
                                function () {
                                    amazonStorage.amazonlogOut();
                                    window.location.reload();
                                }
                            ).fail(
                                function (response) {
                                    fullScreenLoader.stopLoader();
                                    errorProcessor.process(response);
                                }
                            );
                        }
                    }

                    if(!$(".payment-method._active").length){
                        console.log('create active');
                        $(".payment-method:first").addClass('_active');
                    }

                    var $activePaymentMethod = $(".payment-method._active");

                    if (document.getElementById('purchaseorder-form') != null) {
                        document.getElementById('purchaseorder-form').style.display = 'block';
                    }
                    $activePaymentMethod.show();

                    $('.payment-method input[value="' + method + '"]').first().click();
                    if (method === 'braintree_paypal') {
                        $('#braintree_paypal_placeholder').show();
                        $('.iwd_opc_place_order_button').hide();
                    }else {
                        $('#braintree_paypal_placeholder').hide();
                        $('.iwd_opc_place_order_button').show();
                    }
                    if (method === "braintree") {
                        var checkExist = setInterval(function () {
                            $('.iwd_opc_hosted_label[for*="braintree_cc_number"]').click();
                            if ($('#braintree_cc_number').hasClass('braintree-hosted-fields-focused')) {
                                clearInterval(checkExist);
                            }
                        }, 100);
                        document.getElementById('co-transparent-form-braintree').style.display = 'block';
                    }
                    if (method === "amazon_payment") {
                        $('#OffAmazonPaymentsWidgets0').trigger('click');
                        $activePaymentMethod.hide();
                        if (document.getElementById('co-transparent-form-braintree') != null) {
                            document.getElementById('co-transparent-form-braintree').style.display = 'none';
                        }
                        if (document.getElementById('purchaseorder-form') != null) {
                            document.getElementById('purchaseorder-form').style.display = 'none';
                        }
                    }
                } else {
                    selectPaymentMethodAction(null);
                }
            }
        },

        /**
         * Creates default group
         *
         * @returns {Component} Chainable.
         */
        initDefaultGroup: function () {
            layout([
                this.configDefaultGroup
            ]);

            return this;
        },

        /**
         * Create renders for child payment methods.
         *
         * @returns {Component} Chainable.
         */
        initChildren: function () {
            var self = this;

            _.each(paymentMethods(), function (paymentMethodData) {
                self.createRenderer(paymentMethodData);
            });

            return this;
        },

        /**
         * @returns
         */
        createComponent: function (payment) {
            var rendererTemplate,
                rendererComponent,
                templateData;

            templateData = {
                parentName: this.name,
                name: payment.name
            };
            rendererTemplate = {
                parent: '${ $.$data.parentName }',
                name: '${ $.$data.name }',
                displayArea: payment.displayArea,
                component: payment.component
            };
            rendererComponent = utils.template(rendererTemplate, templateData);
            utils.extend(rendererComponent, {
                item: payment.item,
                config: payment.config
            });

            return rendererComponent;
        },

        getPaymentRenderers: function () {
            var newRendererList = rendererList();
            var renderersMap = this.paymentRenderersMap;
            _.each(newRendererList, function (renderer, index) {
                if (renderersMap[renderer.type]) {
                    newRendererList[index]['component'] = renderersMap[renderer.type];
                }
            });
            return newRendererList;
        },

        /**
         * Create renderer.
         *
         * @param {Object} paymentMethodData
         */
        createRenderer: function (paymentMethodData) {
            var isRendererForMethod = false,
                currentGroup;

            registry.get(this.configDefaultGroup.name, function (defaultGroup) {
                _.each(this.getPaymentRenderers(), function (renderer) {

                    if (renderer.hasOwnProperty('typeComparatorCallback') &&
                        typeof renderer.typeComparatorCallback === 'function'
                    ) {
                        isRendererForMethod = renderer.typeComparatorCallback(renderer.type, paymentMethodData.method);
                    } else {
                        isRendererForMethod = renderer.type === paymentMethodData.method;
                    }

                    if (isRendererForMethod) {
                        currentGroup = renderer.group ? renderer.group : defaultGroup;
                        if (quote.paymentMethod()) {
                            var $paymentMethodSelect = $('#iwd_opc_payment_method_select');
                            $paymentMethodSelect.val(quote.paymentMethod().method);
                            $paymentMethodSelect.trigger('change');
                        }
                        this.collectPaymentGroups(currentGroup);


                        var rendererComponent = this.createComponent(
                            {
                                config: renderer.config,
                                component: renderer.component,
                                name: renderer.type,
                                method: paymentMethodData.method,
                                item: paymentMethodData,
                                displayArea: currentGroup.displayArea
                            }
                        );

                        this.paymentMethods.push(this.getPaymentMethodData({
                            method: rendererComponent.name,
                            title: rendererComponent.item.title,
                            displayArea: rendererComponent.displayArea,
                            config: rendererComponent.config
                        }));

                        layout([
                            rendererComponent
                        ]);
                    }
                }.bind(this));
            }.bind(this));
        },

        getPaymentMethodData: function (paymentMethodData) {
            var paymentMethodTitleType = quote.getPaymentTitleType();

            if (paymentMethodTitleType === 'logo_title') {
                if (this.paymentImagesMap[paymentMethodData.method]) {
                    paymentMethodData.image = quote.getPaymentImagePath(this.paymentImagesMap[paymentMethodData.method]);
                }
            }

            if (window.checkoutConfig.payment.ccform.availableTypes && window.checkoutConfig.payment.ccform.availableTypes[paymentMethodData.method]) {
                paymentMethodData.cc_types = JSON.stringify(window.checkoutConfig.payment.ccform.availableTypes[paymentMethodData.method]);
            }

            var paymentConfig = paymentMethodData.config;

            if (paymentConfig && paymentConfig.details && paymentMethodData.displayArea === 'payment-methods-items-vault') {
                if (paymentConfig.details.payerEmail) {
                    paymentMethodData.title = paymentConfig.details.payerEmail;
                    if (this.paymentImagesMap[paymentConfig.code]) {
                        paymentMethodData.image = quote.getPaymentImagePath(this.paymentImagesMap[paymentConfig.code]);
                    }
                } else if (paymentConfig.details.type && paymentConfig.details.maskedCC && paymentConfig.details.expirationDate) {
                    paymentMethodData.title = 'xxxx-xxxx-xxxx-' + paymentConfig.details.maskedCC + ' (' + $t('expires') + ': ' + paymentConfig.details.expirationDate + ')';
                    var ccObj = {};
                    ccObj[paymentConfig.details.type] = paymentConfig.details.type;
                    paymentMethodData.cc_types = JSON.stringify(ccObj);
                }
            }

            return paymentMethodData;
        },
        /**
         * Collects unique groups of available payment methods
         *
         * @param {Object} group
         */
        collectPaymentGroups: function (group) {
            var groupsList = this.paymentGroupsList(),
                isGroupExists = _.some(groupsList, function (existsGroup) {
                    return existsGroup.alias === group.alias;
                });

            if (!isGroupExists) {
                groupsList.push(group);
                groupsList = _.sortBy(groupsList, function (existsGroup) {
                    return existsGroup.sortOrder;
                });
                this.paymentGroupsList(groupsList);
            }
        },


        /**
         * Returns payment group title
         *
         * @param {Object} group
         * @returns {String}
         */
        getGroupTitle: function (group) {
            var title = group().title;

            if (group().isDefault() && this.paymentGroupsList().length > 1) {
                title = this.defaultGroupTitle;
            }

            return title + ':';
        },

        /**
         * Checks if at least one payment method available
         *
         * @returns {String}
         */
        isPaymentMethodsAvailable: function () {
            return _.some(this.paymentGroupsList(), function (group) {
                return this.getRegion(group.displayArea)().length;
            }, this);
        },

        /**
         * Remove view renderer.
         *
         * @param {String} paymentMethodCode
         */
        removeRenderer: function (paymentMethodCode) {
            var items;

            _.each(this.paymentGroupsList(), function (group) {
                items = this.getRegion(group.displayArea);

                _.find(items(), function (value) {
                    if (value.item.method.indexOf(paymentMethodCode) === 0) {
                        this.paymentMethods.remove(function (item) {
                            return item.method === paymentMethodCode;
                        });
                        this.decorateSelect('iwd_opc_payment_method_select');
                        value.disposeSubscriptions();
                        value.destroy();
                    }
                }, this);
            }, this);
        }
    });
});
