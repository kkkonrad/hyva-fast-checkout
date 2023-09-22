/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */

define([
    'jquery',
    'ko',
    'uiComponent',
    'Magento_Checkout/js/model/totals',
    'Magento_Checkout/js/model/quote',
    'Magento_Catalog/js/price-utils',

], function ($, ko, Component, totals, quote, priceUtils) {
    'use strict';

    return Component.extend({
        isLoading: totals.isLoading,

        updateSummaryWrapperTopHeight: function (top){
            let summaryWrapper = $('.opc-block-summary-wrapper');
            summaryWrapper.css({'top':top + 'px'});
        },

        checkoutStepsResize: function () {
            // let summary = $('.opc-block-summary'),
            //     wrapper = document.getElementById("checkoutSteps"),
            //     resizeObserver;
            //
            // resizeObserver = new ResizeObserver(function (checkoutSteps) {
            //     let height = checkoutSteps[0].target.clientHeight;
            //
            //     if ($(document).width() < 992) {
            //         height = '100%';
            //     }
            //
            //     summary.height(height);
            // })

            //resizeObserver.observe(wrapper);

            if (typeof window.safari === 'object') {
                $('.onepage-index-index .opc-block-summary').css({'height': '-webkit-fill-available'});

                if ($(document).width() > 991) {
                    $('#maincontent > .columns').css({'max-height': $('#maincontent').height() +'px'});
                } else {
                    $('#maincontent > .columns').css({'max-height': '100%'});
                }
            }

            window.addEventListener('scroll', function (event) {
                let scrollY = window.scrollY,
                    summary = $('.opc-block-summary'),
                    summaryWrapper = $('.opc-block-summary-wrapper'),
                    top,
                    summaryWrapperHeight,
                    paddingBottom = 50;

                summaryWrapperHeight = summaryWrapper.height() + paddingBottom + scrollY;

                if (summaryWrapperHeight < summary.height()) {
                    top = scrollY;
                } else {
                    return;
                }

                if ($(document).width() < 992) {
                    top = 0;
                }

                summaryWrapper.css({'top':top+'px'});
            });

        },
        bodyResize: function () {
            let self = this,
                resizeObserver;

            resizeObserver = new ResizeObserver(function (body) {
                $('.opc-block-summary-manage-button').removeClass('_active').attr('aria-selected','false').attr('aria-expanded','false');
                self.screenWidth(body[0].target.clientWidth);
                self.screenHeight(body[0].target.clientHeight);

                if (typeof window.safari === 'object') {
                    $('.onepage-index-index .opc-block-summary').css({'height': '-webkit-fill-available'});

                    if ($(document).width() > 991) {
                        $('#maincontent > .columns').css({'max-height': $('#maincontent').height() +'px'});
                    } else {
                        $('#maincontent > .columns').css({'max-height': '100%'});
                    }
                }
            });

            resizeObserver.observe(document.body);
        },

        screenResize: function () {
            let self = this;

            let checkoutStepsInterval = setInterval(function (){
                let wrapper = $('#checkoutSteps');
                    //summary = $('.opc-block-summary')

                if (wrapper.length) {
                    if (!wrapper.height()) {
                        let checkoutSteps = setInterval(function (){
                            if (wrapper.height()) {
                                //summary.height(wrapper.height());
                                self.checkoutStepsResize();
                                clearInterval(checkoutSteps);
                            }
                        },200)
                    } else {
                        //summary.height(wrapper.height());
                        self.checkoutStepsResize();
                    }
                    clearInterval(checkoutStepsInterval);
                }
            },200)

            self.bodyResize();
        },

        manageVisibility: function () {
            let self = this;

            if (!self.opcBlockSummary()) {
                self.shoppingCartVisible(false);
                self.opcBlockSummary(true);
                self.opcManageSummaryButtonTitle(self.defaultActiveButtonTitle());
            } else {
                self.shoppingCartVisible(true);
                self.opcBlockSummary(false);
                self.opcManageSummaryButtonTitle(self.defaultButtonTitle());
            }

            return true;
        },

        getFormattedPrice: function (price) {
            return priceUtils.formatPrice(price, quote.getPriceFormat());
        },

        initialize: function () {
            this._super().observe({
                opcBlockSummary: false,
                opcManageSummaryButton: false,
                shoppingCartVisible: ko.observable(false),
                shoppingCartTitle: 'Back to edit shopping cart',
                shoppingCartLink: '/checkout/cart/',
                defaultButtonTitle: 'View Order Summary - ',
                defaultActiveButtonTitle: 'Back to Checkout',
                opcManageSummaryButtonTitle: '',
                grandTotal: this.getFormattedPrice(totals.totals().grand_total),
                screenWidth: ko.observable(window.screen.width),
                screenHeight: ko.observable(window.screen.height)
            });

            window.checkoutData.summary = this;

            let self = this;

            if (self.screenWidth() > 991) {
                self.opcBlockSummary(true);
            } else {
                self.opcManageSummaryButtonTitle(self.defaultButtonTitle());
                self.opcManageSummaryButton(true);
            }

            self.screenWidth.subscribe(function (screenWidth) {
                if (self.screenWidth() > 991) {
                    self.opcManageSummaryButtonTitle('');
                    self.opcManageSummaryButton(false);
                    self.opcBlockSummary(true);
                } else {
                    self.opcManageSummaryButtonTitle(self.defaultButtonTitle());
                    self.opcManageSummaryButton(true);
                    self.opcBlockSummary(false);
                }
            });

            self.screenResize();

            return this;
        },
    });
});
