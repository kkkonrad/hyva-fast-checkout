define([
    'ko',
    'jquery',
    'Magento_Ui/js/lib/knockout/template/loader',
    'mage/template'
], function (ko, $, templateLoader, template) {
    'use strict';

    var blockLoaderTemplatePath = 'IWD_Opc/block-loader',
        blockContentLoadingClass = '_block-content-loading',
        iwdBlockLoader,
        blockLoaderClass;

    templateLoader.loadTemplate(blockLoaderTemplatePath).done(function (blockLoaderTemplate) {
        iwdBlockLoader = template($.trim(blockLoaderTemplate), {});
        iwdBlockLoader = $(iwdBlockLoader);
        blockLoaderClass = '.' + iwdBlockLoader.attr('class');
    });

    $(document).off('keypress keydown change', '.iwd_main_wrapper input, .iwd_main_wrapper select, .iwd_main_wrapper textarea');
    $(document).on('keypress keydown change', '.iwd_main_wrapper input, .iwd_main_wrapper select, .iwd_main_wrapper textarea', function (e) {
        if ($(this).closest('._block-content-loading').length) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });
    /**
     * Helper function to check if blockContentLoading class should be applied.
     * @param {Object} element
     * @returns {Boolean}
     */
    function isLoadingClassRequired(element) {
        var position = element.css('position');

        return !(position === 'absolute' || position === 'fixed');
    }

    /**
     * Add loader to block.
     * @param {Object} element
     */
    function addBlockLoader(element) {
        element.find(':focus').blur();
        // element.find('input:disabled, select:disabled').addClass('_disabled');
        // element.find('input, select').prop('disabled', true);

        if (isLoadingClassRequired(element)) {
            element.addClass(blockContentLoadingClass);
        }
        element.append(iwdBlockLoader.clone());
    }

    /**
     * Remove loader from block.
     * @param {Object} element
     */
    function removeBlockLoader(element) {
        if (!element.has(blockLoaderClass).length) {
            return;
        }
        element.find(blockLoaderClass).remove();
        // element.find('input:not("._disabled"), select:not("._disabled")').prop('disabled', false);
        // element.find('input:disabled, select:disabled').removeClass('_disabled');
        element.removeClass(blockContentLoadingClass);
    }

    return function () {
        ko.bindingHandlers.iwdBlockLoader = {
            /**
             * Process loader for block
             * @param {String} element
             * @param displayBlockLoader
             */
            update: function (element, displayBlockLoader) {
                element = $(element);

                if (ko.unwrap(displayBlockLoader())) {
                    addBlockLoader(element);
                } else {
                    removeBlockLoader(element);
                }
            }
        };
    };
});
