require(["jquery"], function ($) {
    $(function() {
        let checkoutData = window.checkoutData;
        console.log(checkoutData);

        if(checkoutData && checkoutData.ga4 && checkoutData.ga4.active && checkoutData.ga4.tracking_id.length) {
            GA4.addGoggleAnalyticsFourScript(checkoutData.ga4);
            GA4.initGoogleAnalyticsScript(checkoutData.ga4);
            checkoutData.ga4.events = GA4;

            if(checkoutData.cart && window.checkoutConfig) {
                GA4.sendBeginCheckoutEvent();
            }
        }
    });

    let GA4 = {
        addGoggleAnalyticsFourScript(GA4Data) {
            let script   = document.createElement('script');

            script.src = "https://www.googletagmanager.com/gtag/js?id="+GA4Data.tracking_id;
            document.head.appendChild(script);

            window.dataLayer = window.dataLayer || [];
            window.gtag = function gtag(){dataLayer.push(arguments);}

            window.gtag('js', new Date());
            window.gtag('set', 'page_location', location.protocol + '//' + location.host + location.pathname);
            window.gtag('config', GA4Data.tracking_id, {cookie_flags: 'secure;samesite=none'});
        },

        initGoogleAnalyticsScript(GA4Data) {
            let self = this;

            let createTracker = function(event) {
                if (typeof event.data.gaClientId === 'undefined' || !window.gtag) return;

                if (event.data.gaClientId !== 0) {
                    window.gtag('config', event.data.gaClientId);
                }

                $(document.body).on('click', '.js-send-event-to-ga', function () {
                    self.sendEventToGA($(this).data("ga-event-action"), $(this).data("ga-event-label"));
                });

                $(document.body).on('click', '.js-send-option-event-to-ga', function () {
                    self.sendOptionEventToGA(
                        $(this).data("ga-event-step"),
                        $(this).data("ga-event-action"),
                        $('.shipping-type input:checked').data('title')
                    );
                });

                self.sendBeginCheckoutEvent();
                self.sendShippingPaymentOptionsToGA();
            };

            if (window.addEventListener) {
                window.addEventListener("message", createTracker, false);
            } else if (window.attachEvent) {
                window.attachEvent("onmessage", createTracker);
            }

            // Trigger createTracker function in case parent window didn't send ClientID to trigger GA initiation
            $(window).on("load", function() {
                window.gtag(function(tracker) {
                    if(tracker === undefined) {
                        createTracker({data: {gaClientId: 0}});
                    }
                });
            });
        },

        sendBeginCheckoutEvent() {
            let cart = window.checkoutData.cart;

            window.gtag('event', 'begin_checkout', {
                'event_category': 'Ecommerce',
                'event_label': 'Checkout',
                'currency': cart.currencyCode,
                'value': cart.grandTotal,
                'coupon': cart.couponCode,
                'items': this.getCartItems()
            });
        },

        getCartItems() {
            let cartItems = window.checkoutData.cart.items,
                cartItemsCollectionForGA = [];

            for (let i = 0; i < cartItems.length; i++) {
                let product = cartItems[i],
                    productOptions = product.options,
                    productVariant = '',
                    productFields = {
                        'item_id': product.sku,
                        'item_name': product.name,
                        'price': product.price,
                        'quantity': product.qty
                    };

                if (productOptions.length) {
                    for (let i = 0; i < productOptions.length; i++) {
                        let option = productOptions[i];

                        productVariant += option.label + ': ' + option.value + '; '
                    }
                    productFields.variant = productVariant;
                }
                cartItemsCollectionForGA.push(productFields)
            }

            return cartItemsCollectionForGA;
        },

        sendLoginEventToGA4() {
            if (!window.gtag) return;

            window.gtag("event", "login", {
                method: "Checkout"
            });
        },

        sendPurchaseEventToGA(data) {
            try {
                if (!window.gtag) return;

                window.checkoutData.cart = data;

                window.gtag('event', 'purchase', {
                    'affiliation':    'Dominate Checkout',
                    'transaction_id': data.order_increment_id,
                    'currency':       data.currency,
                    'value':          data.grand_total,
                    'tax':            data.tax,
                    'shipping':       data.shipping,
                    'coupon':         data.coupon_code,
                    'items':          this.getCartItems()
                });
            } catch (err) {
                console.warn('GA purchase event was not sent: ' + err);
            }
        },

        sendEventToGA4(event, field, value) {
            if (!window.gtag) return;

            let data = {
                'currency': window.checkoutData.cart.currencyCode,
                'value': window.checkoutData.cart.grandTotal,
                [field]: value,
                'items': this.getCartItems()
            };

            window.gtag("event", event, data);
        },

        sendShippingPaymentOptionsToGA() {
            let selectedShippingMethod = $('.shipping-type input:checked'),
                selectedPaymentMethod = $('.payment-method input[name="payment[method]"]:checked');

            if (selectedShippingMethod.length) {
                this.sendOptionEventToGA(2, 'Delivery', selectedShippingMethod.data('title'));

                if (selectedPaymentMethod.length) {
                    this.sendOptionEventToGA(3, 'Payment', selectedPaymentMethod.data('title'));
                }
            }
        },

        sendOptionEventToGA(step, action, label) {
            if (!window.gtag) return;

            window.gtag('event', 'checkout_option', {
                'step': step,
                'option': label
            });

            this.sendEventToGA(action, label);
        },

        sendEventToGA(action, label) {
            if (!window.gtag) return;

            window.gtag('event', action, {
                'event_category': 'Checkout',
                'event_label': label
            });
        },

        viewCart() {
            window.gtag("event", "view_cart", {
                'currency': window.checkoutData.cart.currencyCode,
                'value':window.checkoutData.cart.grandTotal,
                'items': this.getCartItems()
            });
        }
    }
});
