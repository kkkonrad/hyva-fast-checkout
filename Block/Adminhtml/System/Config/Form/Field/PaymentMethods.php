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
            $this->addOption('*', __('All Payment Methods'));
            $providerWildcards = [];
            foreach ($this->paymentSource->toOptionArray() as $paymentOption) {
                if (is_array($paymentOption['value'])) {
                    foreach ($paymentOption['value'] as $method) {
                        $this->addProviderWildcardOption($providerWildcards, $method['value']);
                        $this->addOption($method['value'], $method['label']);
                    }
                } else {
                    $this->addProviderWildcardOption($providerWildcards, $paymentOption['value']);
                    $this->addOption($paymentOption['value'], $paymentOption['label']);
                }
            }
        }
        return parent::_toHtml();
    }

    private function addProviderWildcardOption(array &$providerWildcards, $methodCode): void
    {
        if (!is_string($methodCode) || strpos($methodCode, '_') === false) {
            return;
        }

        $parts = explode('_', $methodCode, 2);
        $providerCode = (string)($parts[0] ?? '');
        if ($providerCode === '' || isset($providerWildcards[$providerCode])) {
            return;
        }

        $providerWildcards[$providerCode] = true;
        $this->addOption($providerCode . '_*', __('%1 - All Variants', $providerCode));
    }
}
