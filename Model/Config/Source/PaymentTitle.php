<?php

namespace IWD\Opc\Model\Config\Source;

use \Magento\Framework\Option\ArrayInterface;

class PaymentTitle implements ArrayInterface
{
    /**
     * Options getter
     *
     * @return array
     */
    public function toOptionArray()
    {
        return [
            ['value' => 'logo_title', 'label' => __('Show logo and title')],
            ['value' => 'title', 'label' => __('Show title only')],
        ];
    }

    /**
     * Get options in "key-value" format
     *
     * @return array
     */
    public function toArray()
    {
        return [
            'logo_title' => __('Show logo and title'),
            'title' => __('Show title only'),
        ];
    }
}
