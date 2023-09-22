<?php

namespace IWD\Opc\Block\Adminhtml\System\Config\Layout\Address;

use Magento\Framework\Option\ArrayInterface;

class FormOrder implements ArrayInterface
{
    public function toOptionArray()
    {
        return [
            [
                'value' => 'shipping_first',
                'label' => __('Shipping Address First')
            ], [
                'value' => 'billing_first',
                'label' => __('Billing Address First')
            ],
        ];
    }
}