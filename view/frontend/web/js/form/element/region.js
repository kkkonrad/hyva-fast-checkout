define([
    'underscore',
    'uiRegistry',
    'IWD_Opc/js/form/element/select',
    'IWD_Opc/js/model/default-post-code-resolver'
], function (_, registry, Select, defaultPostCodeResolver) {
    'use strict';

    return Select.extend({
        defaults: {
            skipValidation: false,
            imports: {
                update: '${ $.parentName }.country_id:value'
            }
        },

        initialize: function () {
            this._super()
                .update()
                .switchRequiredPlaceholder(this.validation['required-entry']);

            setTimeout(this.initFilter.bind(this), 10);
            return this;
        },

        update: function () {
            var country = registry.get(this.parentName + '.' + 'country_id'),
                initialCountry = (country ? country.initialValue : null),
                option;

            if (!initialCountry || !country) {
                return this;
            }

            var options = country.indexedOptions;
            option = options[initialCountry];
            if (option) {
                defaultPostCodeResolver.setUseDefaultPostCode(!option['is_zipcode_optional']);
            }

            if (this.skipValidation) {
                this.validation['required-entry'] = false;
                this.required(false);
                this.switchRequiredPlaceholder(false);
            } else {
                if (option && !option['is_region_required']) {
                    this.error(false);
                    this.validation = _.omit(this.validation, 'required-entry');
                } else {
                    this.validation['required-entry'] = true;
                }

                this.required(!!option['is_region_required']);
                this.switchRequiredPlaceholder(!!option['is_region_required']);
            }

            return this;
        },

        /**
         * Filters 'initialOptions' property by 'field' and 'value' passed,
         * calls 'setOptions' passing the result to it
         *
         * @param {*} value
         * @param {String} field
         */
        filter: function (value, field) {
            var country = registry.get(this.parentName + '.' + 'country_id');

            if (country && value) {
                var option = country.indexedOptions[value];

                this._super(value, field);

                if (option && (option['is_region_required'] || option['is_region_visible'])) {
                    var hasRegionOptions = false;

                    var regions = [];

                    if (country.source.dictionaries) {
                        regions = country.source.dictionaries.region_id;
                    } else {
                        regions = this.initialOptions;
                    }

                    for (var i = 0; i < regions.length; i++) {
                        if (regions[i].country_id === value) {
                            hasRegionOptions = true;
                            break;
                        }
                    }

                    if (hasRegionOptions) {
                        this.setVisible(true);
                        this.toggleInput(false);
                    } else {
                        this.setVisible(false);
                        this.toggleInput(true);
                    }
                } else {
                    this.setVisible(false);
                    this.toggleInput(false);
                }
            }
        }
    });
});

