<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Payment\Model\Config;

class PaymentMethods extends \Magento\Framework\View\Element\Html\Select
{
    /**
     * @var Config
     */
    private $paymentConfig;

    /**
     * PaymentMethods constructor.
     *
     * @param Context $context
     * @param Config $paymentConfig
     * @param array $data
     */
    public function __construct(
        Context $context,
        Config $paymentConfig,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->paymentConfig = $paymentConfig;
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
            foreach ($this->paymentConfig->getActiveMethods() as $code => $method) {
                if ($code !== 'free') {
                    $this->addOption($code, $method->getTitle());
                }
            }
        }
        return parent::_toHtml();
    }
}
