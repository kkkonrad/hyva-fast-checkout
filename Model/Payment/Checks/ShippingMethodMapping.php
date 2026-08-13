<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Payment\Checks;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Payment\Model\Checks\SpecificationInterface;
use Magento\Payment\Model\MethodInterface;
use Magento\Quote\Model\Quote;

class ShippingMethodMapping implements SpecificationInterface
{
    private Helper $helper;

    public function __construct(Helper $helper)
    {
        $this->helper = $helper;
    }

    public function isApplicable(MethodInterface $paymentMethod, Quote $quote): bool
    {
        $mapping = $this->helper->getShippingPaymentMapping();

        if (!$this->helper->isEnable() || !$mapping || $quote->isVirtual()) {
            return true;
        }

        $shippingAddress = $quote->getShippingAddress();
        $shippingCode = $shippingAddress ? trim((string)$shippingAddress->getShippingMethod()) : '';
        if ($shippingCode === '') {
            return true;
        }

        $paymentCode = (string)$paymentMethod->getCode();
        $mentionsPayment = false;

        foreach ($mapping as $rule) {
            if (!is_array($rule) || (string)($rule['payment_method'] ?? '') !== $paymentCode) {
                continue;
            }
            $mentionsPayment = true;
            if ($this->matches((string)($rule['shipping_method'] ?? ''), $shippingCode)) {
                return true;
            }
        }

        // Payments never listed in admin mapping stay available so a newly
        // installed PayU/Stripe/etc. is not hidden until someone edits the grid.
        return !$mentionsPayment;
    }

    private function matches(string $rule, string $shippingCode): bool
    {
        $expected = trim($rule);
        $carrier = explode('_', $shippingCode, 2)[0];

        if ($expected === '' || $shippingCode === '') {
            return false;
        }
        if ($expected === '*' || $expected === $shippingCode || $expected === $carrier) {
            return true;
        }
        if (substr($expected, -1) !== '*') {
            return false;
        }

        $prefix = rtrim(substr($expected, 0, -1), '_');

        return $prefix !== '' && strpos($shippingCode, $prefix . '_') === 0;
    }
}
