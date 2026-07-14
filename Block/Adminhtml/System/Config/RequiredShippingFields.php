<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config;

use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\ShippingMethods;

class RequiredShippingFields extends RequiredFields
{
    protected function getFieldOptions(): array
    {
        return [
            [
                'value' => 'extension_attributes.pickup_location_code',
                'label' => (string)__('Pickup Location Code'),
            ],
            [
                'value' => 'custom_attributes.pickup_location_code',
                'label' => (string)__('Pickup Location Code (Custom Attribute)'),
            ],
            [
                'value' => 'extension_attributes.locker_id',
                'label' => (string)__('Locker ID'),
            ],
            [
                'value' => 'extension_attributes.pickup_point_id',
                'label' => (string)__('Pickup Point ID'),
            ],
        ];
    }

    protected function getMethodRendererClass(): string
    {
        return ShippingMethods::class;
    }

    protected function getMethodColumnLabel()
    {
        return __('Shipping Method');
    }

    protected function getAddRowButtonLabel()
    {
        return __('Add Shipping Requirement');
    }
}
