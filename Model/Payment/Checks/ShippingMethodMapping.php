<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Payment\Checks;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Payment\Model\Checks\SpecificationInterface;
use Magento\Payment\Model\MethodInterface;
use Magento\Quote\Model\Quote;
use Magento\Store\Model\ScopeInterface;

class ShippingMethodMapping implements SpecificationInterface
{
    private const XML_PATH_MAPPING = 'fastcheckout/extended/shipping_payment_mapping';

    public function __construct(
        private Helper $helper,
        private ScopeConfigInterface $scopeConfig
    ) {
    }

    public function isApplicable(MethodInterface $paymentMethod, Quote $quote): bool
    {
        $mapping = json_decode((string)$this->scopeConfig->getValue(
            self::XML_PATH_MAPPING,
            ScopeInterface::SCOPE_STORE
        ), true);
        if (!$this->helper->isEnable() || !is_array($mapping) || !$mapping || $quote->isVirtual()) {
            return true;
        }

        $address = $quote->getShippingAddress();
        $shipping = $address ? trim((string)$address->getShippingMethod()) : '';
        if ($shipping === '') {
            return true;
        }

        $payment = (string)$paymentMethod->getCode();
        $carrier = explode('_', $shipping, 2)[0];
        $listed = false;
        foreach ($mapping as $rule) {
            if (!is_array($rule) || (string)($rule['payment_method'] ?? '') !== $payment) {
                continue;
            }
            $listed = true;
            $expected = trim((string)($rule['shipping_method'] ?? ''));
            if ($expected === $carrier || fnmatch($expected, $shipping)) {
                return true;
            }
        }

        return !$listed;
    }
}
