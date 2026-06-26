<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Kkkonrad\Fastcheckout\Model\Config\Source\Payment as PaymentSource;
use Magento\Framework\View\Element\Context;

class PaymentMethods extends \Magento\Framework\View\Element\Html\Select
{
    /**
     * @var PaymentSource
     */
    private $paymentSource;

    /**
     * PaymentMethods constructor.
     *
     * @param Context $context
     * @param PaymentSource $paymentSource
     * @param array $data
     */
    public function __construct(
        Context $context,
        PaymentSource $paymentSource,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->paymentSource = $paymentSource;
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
            foreach ($this->paymentSource->toOptionArray() as $paymentOption) {
                if (is_array($paymentOption['value'])) {
                    foreach ($paymentOption['value'] as $method) {
                        $this->addOption($method['value'], $method['label']);
                    }
                } else {
                    $this->addOption($paymentOption['value'], $paymentOption['label']);
                }
            }
        }
        return parent::_toHtml();
    }
}
