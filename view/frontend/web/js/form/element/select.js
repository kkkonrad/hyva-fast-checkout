define([
    'jquery',
    'underscore',
    'mageUtils',
    'uiRegistry',
    'Magento_Ui/js/form/element/abstract',
    'uiLayout'
], function ($, _, utils, registry, Abstract, layout) {
    'use strict';

    var inputNode = {
        parent: '${ $.$data.parentName }',
        component: 'Magento_Ui/js/form/element/abstract',
        template: '${ $.$data.template }',
        provider: '${ $.$data.provider }',
        name: '${ $.$data.index }_input',
        dataScope: '${ $.$data.customEntry }',
        customScope: '${ $.$data.customScope }',
        sortOrder: {
            after: '${ $.$data.name }'
        },
        displayArea: 'body',
        label: '${ $.$data.label }',
        placeholder: '${ $.$data.placeholder }'
    };

    /**
     * Parses incoming options, considers options with undefined value property
     *     as caption
     *
     * @param  {Array} nodes
     * @param captionValue
     * @return {Object}
     */
    function parseOptions(nodes, captionValue) {
        var caption,
            value;

        nodes = _.map(nodes, function (node) {
            value = node.value;

            if (value === null || value === captionValue) {
                if (_.isUndefined(caption)) {
                    caption = node.label;
                }
            }

            return node;
        });

        return {
            options: _.compact(nodes),
            caption: _.isString(caption) ? caption : false
        };
    }

    /**
     * Recursively loops over data to find non-undefined, non-array value
     *
     * @param  {Array} data
     * @return {*} - first non-undefined value in array
     */
    function findFirst(data) {
        var value;

        data.some(function (node) {
            value = node.value;

            if (Array.isArray(value)) {
                value = findFirst(value);
            }

            return !_.isUndefined(value);
        });

        return value;
    }

    /**
     * Recursively set to object item like value and item.value like key.
     *
     * @param {Array} data
     * @param {Object} result
     * @returns {Object}
     */
    function indexOptions(data, result) {
        var value;

        result = result || {};

        data.forEach(function (item) {
            value = item.value;

            if (Array.isArray(value)) {
                indexOptions(value, result);
            } else {
                result[value] = item;
            }
        });

        return result;
    }

    return Abstract.extend({
        defaults: {
            customName: '${ $.parentName }.${ $.index }_input',
            elementTmpl: 'IWD_Opc/form/element/select',
            caption: '',
            options: []
        },

        optionsRenderCallback: 0,

        decorateSelect: function (uid, showEmptyOption) {
            if (typeof showEmptyOption === 'undefined') { showEmptyOption = false; }
            clearTimeout(this.optionsRenderCallback);
            this.optionsRenderCallback = setTimeout(function () {
                var select = $('#' + uid);
                if (select.length) {
                    select.decorateSelect(showEmptyOption);
                }
            }, 0);
        },

        /**
         * Extends instance with defaults, extends config with formatted values
         *     and options, and invokes initialize method of AbstractElement class.
         *     If instance's 'customEntry' property is set to true, calls 'initInput'
         */
        initialize: function () {
            this._super();

            if (this.customEntry) {
                registry.get(this.name, this.initInput.bind(this));
            }

            if (this.filterBy) {
                this.initFilter();
            }

            return this;
        },

        /**
         * Parses options and merges the result with instance
         *
         * @param  {Object} config
         * @returns {Object} Chainable.
         */
        initConfig: function (config) {
            var options = config.options,
                captionValue = config.captionValue || '',
                result = parseOptions(options, captionValue);

            if (config.caption) {
                delete result.caption;
            }

            _.extend(config, result);

            this._super();

            return this;
        },

        /**
         * Calls 'initObservable' of parent, initializes 'options' and 'initialOptions'
         *     properties, calls 'setOptions' passing options to it
         *
         * @returns {Object} Chainable.
         */
        initObservable: function () {
            this._super();

            this.initialOptions = this.options;

            this.observe('options caption')
                .setOptions(this.options());

            return this;
        },

        /**
         * Set link for filter.
         *
         * @returns {Object} Chainable
         */
        initFilter: function () {
            var filter = this.filterBy;

            this.filter(this.default, filter.field);
            this.setLinks({
                filter: filter.target
            }, 'imports');

            return this;
        },

        /**
         * Creates input from template, renders it via renderer.
         *
         * @returns {Object} Chainable.
         */
        initInput: function () {
            layout([utils.template(inputNode, this)]);

            return this;
        },

        /**
         * Matches specfied value with existing options
         * or, if value is not specified, returns value of the first option.
         *
         * @returns {*}
         */
        normalizeData: function () {
            var value = this._super(),
                option;

            if (value !== '') {
                option = this.getOption(value);

                return option && option.value;
            }

            if (!this.caption()) {
                return findFirst(this.options);
            }
        },

        /**
         * Filters 'initialOptions' property by 'field' and 'value' passed,
         * calls 'setOptions' passing the result to it
         *
         * @param {*} value
         * @param {String} field
         */
        filter: function (value, field) {
            var source = this.initialOptions,
                $select = $('#' + this.uid),
                result;

            field = field || this.filterBy.field;

            result = _.filter(source, function (item) {
                return item[field] === value || item.value === '';
            });

            this.setOptions(result);

            if ($select.length) {
                var $selectize = $select[0].selectize;

                if ($selectize) {
                    $selectize.clearOptions();

                    _.each(result, function($option) {
                        if ($option.value) {
                            $selectize.addOption({text: $option.label, value: $option.value})
                        }
                    });

                    $selectize.refreshOptions(false);
                    $selectize.refreshItems();
                }
            }
        },

        /**
         * Change visibility for input.
         *
         * @param {Boolean} isVisible
         */
        toggleInput: function (isVisible) {
            registry.get(this.customName, function (input) {
                input.setVisible(isVisible);
            });
        },

        /**
         * Sets 'data' to 'options' observable array, if instance has
         * 'customEntry' property set to true, calls 'setHidden' method
         *  passing !options.length as a parameter
         *
         * @param {Array} data
         * @returns {Object} Chainable
         */
        setOptions: function (data) {
            var captionValue = this.captionValue || '',
                result = parseOptions(data, captionValue),
                isVisible;

            this.indexedOptions = indexOptions(result.options, false);

            this.options(result.options);

            if (!this.caption()) {
                this.caption(result.caption);
            }

            if (this.customEntry) {
                isVisible = !!result.options.length;

                this.setVisible(isVisible);
                this.toggleInput(!isVisible);
            }

            return this;
        },

        /**
         * Processes preview for option by it's value, and sets the result
         * to 'preview' observable
         *
         * @returns {Object} Chainable.
         */
        getPreview: function () {
            var value = this.value(),
                option = this.indexedOptions[value],
                preview = option ? option.label : '';

            this.preview(preview);

            return preview;
        },

        getOption: function (value) {
            return this.indexedOptions[value];
        },

        /**
         * Select first available option
         *
         * @returns {Object} Chainable.
         */
        clear: function () {
            var value = this.caption() ? '' : findFirst(this.options);

            this.value(value);

            return this;
        },

        /**
         * Initializes observable properties of instance.
         *
         * @returns {Object} Chainable.
         */
        setInitialValue: function () {
            if (_.isUndefined(this.value()) && !this.default) {
                this.clear();
            }

            return this._super();
        },

        switchRequiredPlaceholder: function (required) {
            if (typeof required === 'undefined') {
                required = true;
            }

            if (this.indexedOptions && this.indexedOptions['']) {
                var $this = this,
                    $select = $('#' + this.uid),
                    $message = this.modifyRequiredMessage(this.indexedOptions['']['label'], required);

                this.indexedOptions['']['label'] = $message;

                registry.get(this.customName, function (input) {
                    var $input = $('#' + input.uid),
                        $message = $this.modifyRequiredMessage(input.placeholder, required);

                    input.placeholder = $message;

                    if ($input.length) {
                        $input.attr('placeholder', $message);
                    }
                });

                if ($select.length) {
                    $select.children('option[value=""]').text($message);
                    var $selectize = $select[0].selectize;

                    if ($selectize) {
                        $selectize.settings.placeholder = $message;
                        $selectize.updatePlaceholder();
                    }
                }
            }

            return this;
        },

        modifyRequiredMessage: function (message, required) {
            if (required && !message.lastIndexOf(' *') === (message.length - 2)) {
                message = message + ' *';
            }
            else if (!required) {
                message = message.replace(/ \*$/, '');
            }

            return message;
        }
    });
});
