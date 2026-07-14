define([
    'jquery',
    'jquery/bootstrap/collapse',
    'jquery/ui',
    'jquery/jquery.tabs'
], function ($, Collapse) {
    'use strict';

    // Bootstrap 5 defers the jQuery bridge until DOMContentLoaded. Magento's
    // admin theme can run in the same event turn, so expose it synchronously.
    if (typeof $.fn.collapse !== 'function' && Collapse && typeof Collapse.jQueryInterface === 'function') {
        $.fn.collapse = Collapse.jQueryInterface;
        $.fn.collapse.Constructor = Collapse;
    }

    if (!$.mage.collapsable) {
        $.widget('mage.collapsable', {
            options: {
                parent: null,
                openedClass: 'opened',
                wrapper: '.fieldset-wrapper'
            },

            _create: function () {
                this._events();
            },

            _events: function () {
                var self = this;

                this.element
                    .on('show.bs.collapse', function (event) {
                        $(this).closest(self.options.wrapper).addClass(self.options.openedClass);
                        event.stopPropagation();
                    })
                    .on('hide.bs.collapse', function (event) {
                        $(this).closest(self.options.wrapper).removeClass(self.options.openedClass);
                        event.stopPropagation();
                    });
            }
        });
    }

    return $.mage.collapsable;
});
