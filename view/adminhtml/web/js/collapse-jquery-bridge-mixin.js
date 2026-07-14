define([
    'jquery'
], function ($) {
    'use strict';

    return function (Collapse) {
        // Bootstrap registers its jQuery bridge on DOMContentLoaded. Magento's
        // admin theme can call .collapse() earlier, so expose only this bridge
        // synchronously without replacing the global "collapsable" module.
        if (typeof $.fn.collapse !== 'function' &&
            Collapse &&
            typeof Collapse.jQueryInterface === 'function'
        ) {
            $.fn.collapse = Collapse.jQueryInterface;
            $.fn.collapse.Constructor = Collapse;
        }

        return Collapse;
    };
});
