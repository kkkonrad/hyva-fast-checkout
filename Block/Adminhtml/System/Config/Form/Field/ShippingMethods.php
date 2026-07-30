<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Shipping\Model\Config\Source\Allmethods;

class ShippingMethods extends \Magento\Framework\View\Element\Html\Select
{
    /**
     * @var Allmethods
     */
    private $shippingSource;

    /**
     * ShippingMethods constructor.
     *
     * @param Context $context
     * @param Allmethods $shippingSource
     * @param array $data
     */
    public function __construct(
        Context $context,
        Allmethods $shippingSource,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->shippingSource = $shippingSource;
    }

    /**
     * Set input name
     *
     * @param string $value
     * @return $this
     */
    public function setInputName($value)
    {
        return $this->setData('name', $value);
    }

    /**
     * Render block HTML
     *
     * @return string
     */
    public function _toHtml()
    {
        if (!$this->getOptions()) {
            $this->addOption('*', __('All Shipping Methods'));
            foreach ($this->shippingSource->toOptionArray(true) as $shippingOption) {
                if (is_array($shippingOption['value'])) {
                    $carrierCode = $this->getCarrierCodeFromMethods($shippingOption['value']);
                    if ($carrierCode !== '') {
                        $this->addOption(
                            $carrierCode . '_*',
                            __('%1 - All Methods', $shippingOption['label'])
                        );
                    }
                    foreach ($shippingOption['value'] as $method) {
                        $this->addOption(
                            $method['value'],
                            preg_replace('#^\[.+?\]\s#', '', (string)$method['label'])
                        );
                    }
                } else {
                    $this->addOption($shippingOption['value'], $shippingOption['label']);
                }
            }
        }
        return parent::_toHtml();
    }

    private function getCarrierCodeFromMethods(array $methods): string
    {
        foreach ($methods as $method) {
            if (!empty($method['value']) && is_string($method['value'])) {
                $parts = explode('_', $method['value'], 2);
                return (string)($parts[0] ?? '');
            }
        }

        return '';
    }
}
