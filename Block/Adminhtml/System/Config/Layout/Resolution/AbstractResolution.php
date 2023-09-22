<?php

namespace IWD\Opc\Block\Adminhtml\System\Config\Layout\Resolution;

use Magento\Framework\Option\ArrayInterface;

class AbstractResolution implements ArrayInterface
{
    public function toOptionArray()
    {
        return [
            [
                'value' => 'onepage',
                'label' => __('Onepage Design')
            ], 
            [
                'value' => 'multistep',
                'label' => __('Multistep Design')
            ],
        ];
    }
}

?>