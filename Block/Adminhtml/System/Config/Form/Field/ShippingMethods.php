<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Html\Select;
use Magento\Backend\Block\Template\Context;
use Magento\Shipping\Model\Config as ShippingConfig;

class ShippingMethods extends Select
{
    /**
     * @var ShippingConfig
     */
    private $shippingConfig;

    /**
     * Constructor
     */
    public function __construct(
        Context $context,
        ShippingConfig $shippingConfig,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->shippingConfig = $shippingConfig;
    }

    /**
     * Set input name
     */
    public function setInputName($value)
    {
        return $this->setData('name', $value);
    }

    /**
     * Render block HTML
     */
    public function _toHtml()
    {
        if (!$this->getOptions()) {
            $this->addOption('', __('-- Select Shipping Method --'));
            $activeCarriers = $this->shippingConfig->getActiveCarriers();
            foreach ($activeCarriers as $carrierCode => $carrierModel) {
                $carrierMethods = $carrierModel->getAllowedMethods();
                $carrierTitle = $this->_scopeConfig->getValue('carriers/' . $carrierCode . '/title') ?: $carrierCode;
                foreach ($carrierMethods as $methodCode => $methodTitle) {
                    $fullCode = $carrierCode . '_' . $methodCode;
                    $label = '[' . $carrierTitle . '] ' . ($methodTitle ?: $methodCode);
                    $this->addOption($fullCode, $label);
                }
            }
        }
        return parent::_toHtml();
    }
}
