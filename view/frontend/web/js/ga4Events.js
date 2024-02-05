define([
    'jquery',
], function ($) {
    'use strict';

    return {
        isActive: function () {
            return (window.checkoutData && window.checkoutData.ga4 && window.checkoutData.ga4.events) ? 1 : 0;
        },

        getEvents: function () {
            return window.checkoutData.ga4.events;
        },

        googleEvent: function (action, label) {
            if(!this.isActive()) return;
            this.getEvents().sendEventToGA(action, label);
        },

        loginEvent: function () {
            if(!this.isActive()) return;
            this.getEvents().sendEventToGA('Login', 'Login in');
            this.getEvents().sendLoginEventToGA4();
        },

        failedLoginEvent: function () {
            this.googleEvent('Login', 'Login failed attempt');
        },

        recoverPasswordEvent: function () {
            this.googleEvent('Login', 'Recover Password');
        },

        editCartEvent: function () {
            if(!this.isActive()) return;
            this.getEvents().sendEventToGA('Order Summary', 'Edit Cart');
            this.getEvents().viewCart();
        },

        applyCouponEvent: function () {
            this.googleEvent('Coupon', 'Apply Coupon');
        },

        cancelCouponEvent: function () {
            this.googleEvent('Coupon', 'Cancel Coupon');
        },

        shippingPaymentOptionEvent: function () {
            if(!this.isActive()) return;
            this.getEvents().sendShippingPaymentOptionsToGA();
        },

        changeAddressEvent: function () {
            this.googleEvent('Address', 'Change Billing Address');
        },

        changeShippingMethod: function (title) {
            if(!this.isActive()) return;
            this.getEvents().sendOptionEventToGA(2, 'Delivery', title);
            this.getEvents().sendEventToGA4('add_shipping_info', 'shipping_tier', title);
        },

        changePaymentMethod: function (title) {
            if(!this.isActive()) return;
            this.getEvents().sendOptionEventToGA(3, 'Payment', title);
            this.getEvents().sendEventToGA4('add_payment_info', 'payment_type', title);
        },

        purchaseEvent: function (data) {
            if(!this.isActive()) return;
            this.getEvents().sendPurchaseEventToGA(JSON.parse(data));
        },

        failedPaymentEvent: function () {
            this.googleEvent('Payment', 'Failed');
        }
    };
})
