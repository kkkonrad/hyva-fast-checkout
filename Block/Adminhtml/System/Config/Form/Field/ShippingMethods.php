<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Kkkonrad\Fastcheckout\Model\Config\Source\Shipping as ShippingSource;
use Magento\Framework\View\Element\Context;

class ShippingMethods extends \Magento\Framework\View\Element\Html\Select
{
    /**
     * @var ShippingSource
     */
    private $shippingSource;

    /**
     * ShippingMethods constructor.
     *
     * @param Context $context
     * @param ShippingSource $shippingSource
     * @param array $data
     */
    public function __construct(
        Context $context,
        ShippingSource $shippingSource,
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
            foreach ($this->shippingSource->toOptionArray() as $shippingOption) {
                if (is_array($shippingOption['value'])) {
                    foreach ($shippingOption['value'] as $method) {
                        $this->addOption($method['value'], $method['label']);
                    }
                } else {
                    $this->addOption($shippingOption['value'], $shippingOption['label']);
                }
            }
        }
        return parent::_toHtml();
    }
}
