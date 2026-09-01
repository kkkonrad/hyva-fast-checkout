<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Framework\View\Element\Html\Select;
use Magento\Shipping\Model\Config\Source\Allmethods;

class ShippingMethods extends Select
{
    public function __construct(
        Context $context,
        private Allmethods $shippingSource,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function setInputName($value)
    {
        return $this->setData('name', $value);
    }

    public function _toHtml()
    {
        if (!$this->getOptions()) {
            $this->addOption('*', __('All Shipping Methods'));
            foreach ($this->shippingSource->toOptionArray(true) as $option) {
                if (!is_array($option['value'])) {
                    $this->addOption($option['value'], $option['label']);
                    continue;
                }

                $carrier = $this->carrierCode($option['value']);
                if ($carrier !== '') {
                    $this->addOption($carrier . '_*', __('%1 - All Methods', $option['label']));
                }
                foreach ($option['value'] as $method) {
                    $this->addOption(
                        $method['value'],
                        preg_replace('#^\[.+?\]\s#', '', (string)$method['label'])
                    );
                }
            }
        }

        return parent::_toHtml();
    }

    private function carrierCode(array $methods): string
    {
        foreach ($methods as $method) {
            if (!empty($method['value']) && is_string($method['value'])) {
                return explode('_', $method['value'], 2)[0];
            }
        }

        return '';
    }
}
