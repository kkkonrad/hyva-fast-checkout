define(
    [
        'jquery',
        'ko',
        'Magento_Checkout/js/view/summary',
        'Magento_Checkout/js/model/step-navigator',
    ],
    function(
        $,
        ko,
        Component,
        stepNavigator
    ) {
        'use strict';

        return Component.extend({

            isVisible: function () {
                return true;
            },

            initialize: function () {
                var self = this;
                this._super();
            }

        });
    }
);