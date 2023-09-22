<?php

namespace IWD\Opc\Model\Config\Source;

use Magento\Shipping\Model\Config\Source\Allmethods;

/**
 * Class Shipping
 *
 * @package IWD\Opc\Model\Config\Source
 */
class Shipping extends Allmethods
{
    /**
     * @param bool $isActiveOnlyFlag
     * @return array
     */
    public function toOptionArray($isActiveOnlyFlag = false)
    {
        $options = parent::toOptionArray(true);
        if(count($options) <= 1) {
            $options[0]['label'] = '-- Please enable shipping methods in Sales -> Shipping Methods --';
        } else {
            $options[0]['label'] = '-- Please select a shipping method --';
            foreach ($options as &$option) {
                if (is_array($option['value'])) {
                    foreach ($option['value'] as &$method) {
                        $method['label'] = preg_replace('#^\[.+?\]\s#', '', $method['label']);
                    }
                }
            }
        }

        return $options;
    }
}
