<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Context;
use Magento\Framework\View\Element\Html\Select;
use Magento\Payment\Model\Config;

class PaymentMethods extends Select
{
    public function __construct(
        Context $context,
        private Config $paymentConfig,
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
            foreach ($this->paymentConfig->getActiveMethods() as $code => $method) {
                if ($code !== 'free') {
                    $this->addOption($code, $method->getTitle());
                }
            }
        }

        return parent::_toHtml();
    }
}
