<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Payment\Checks;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Payment\Model\Checks\SpecificationInterface;
use Magento\Payment\Model\MethodInterface;
use Magento\Quote\Model\Quote;

class ShippingMethodMapping implements SpecificationInterface
{
    public function __construct(private Helper $helper)
    {
    }

    public function isApplicable(MethodInterface $paymentMethod, Quote $quote): bool
    {
        $mapping = $this->helper->getShippingPaymentMapping();
        if (!$this->helper->isEnable() || !$mapping || $quote->isVirtual()) {
            return true;
        }

        $address = $quote->getShippingAddress();
        $shipping = $address ? trim((string)$address->getShippingMethod()) : '';
        if ($shipping === '') {
            return true;
        }

        $payment = (string)$paymentMethod->getCode();
        $listed = false;
        foreach ($mapping as $rule) {
            if (!is_array($rule) || (string)($rule['payment_method'] ?? '') !== $payment) {
                continue;
            }
            $listed = true;
            if ($this->matches((string)($rule['shipping_method'] ?? ''), $shipping)) {
                return true;
            }
        }

        return !$listed;
    }

    private function matches(string $rule, string $shipping): bool
    {
        $expected = trim($rule);
        $carrier = explode('_', $shipping, 2)[0];
        if ($expected === '' || $shipping === '') {
            return false;
        }
        if ($expected === '*' || $expected === $shipping || $expected === $carrier) {
            return true;
        }
        if (!str_ends_with($expected, '*')) {
            return false;
        }

        $prefix = rtrim(substr($expected, 0, -1), '_');
        return $prefix !== '' && str_starts_with($shipping, $prefix . '_');
    }
}
