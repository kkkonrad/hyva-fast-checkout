/**
 * Magento stock notCalculatedMessage is a long "Selected shipping method is not
 * available..." sentence used both when no method is chosen yet and when a method
 * became invalid. In the narrow Fastcheckout summary column that text overflows
 * the flex totals row. Prefer the short phrase Magento already uses for tax.
 */
define([
    'mage/translate',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($t, isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            initialize: function () {
                this._super();

                if (isFastcheckoutActive()) {
                    this.notCalculatedMessage = $t('Not yet calculated');
                }

                return this;
            }
        });
    };
});
