<?php

namespace IWD\Opc\Block\Adminhtml\System\Config\Form\Field;

use Magento\Framework\View\Element\Html\Select;
use Magento\Backend\Block\Template\Context;
use Magento\Payment\Helper\Data as PaymentHelper;

class PaymentMethods extends Select
{
    /**
     * @var PaymentHelper
     */
    private $paymentHelper;

    /**
     * Constructor
     */
    public function __construct(
        Context $context,
        PaymentHelper $paymentHelper,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->paymentHelper = $paymentHelper;
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
            $this->addOption('', __('-- Select Payment Method --'));
            $methods = $this->paymentHelper->getPaymentMethodList();
            foreach ($methods as $code => $title) {
                $this->addOption($code, $title . ' (' . $code . ')');
            }
        }
        return parent::_toHtml();
    }
}
