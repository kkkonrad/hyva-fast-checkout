<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\Data\PaymentInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;

/** Capture Fastcheckout extras while Magento saves the native payment data. */
class PlaceOrderExtrasPlugin
{
    private CheckoutSession $checkoutSession;
    private Helper $helper;

    public function __construct(CheckoutSession $checkoutSession, Helper $helper)
    {
        $this->checkoutSession = $checkoutSession;
        $this->helper = $helper;
    }

    /**
     * @return array{0: int|string, 1: PaymentInterface}
     */
    public function beforeSet(
        PaymentMethodManagementInterface $subject,
        $cartId,
        PaymentInterface $paymentMethod
    ): array {
        if (!$this->helper->isEnable()) {
            return [$cartId, $paymentMethod];
        }

        $comment = $this->extractComment($paymentMethod);
        if ($comment === '') {
            $this->checkoutSession->unsFastcheckoutComment();
        } else {
            $this->checkoutSession->setFastcheckoutComment($comment);
        }

        $subscribe = $this->extractSubscribe($paymentMethod);
        if ($subscribe === null) {
            $this->checkoutSession->unsFastcheckoutSubscribe();
        } else {
            $this->checkoutSession->setFastcheckoutSubscribe($subscribe ? 1 : 0);
        }

        return [$cartId, $paymentMethod];
    }

    private function extractComment(PaymentInterface $paymentMethod): string
    {
        $extensionAttributes = $paymentMethod->getExtensionAttributes();
        if ($extensionAttributes && method_exists($extensionAttributes, 'getComment')) {
            return trim((string)$extensionAttributes->getComment());
        }

        return '';
    }

    private function extractSubscribe(PaymentInterface $paymentMethod): ?bool
    {
        $extensionAttributes = $paymentMethod->getExtensionAttributes();
        if ($extensionAttributes && method_exists($extensionAttributes, 'getSubscribe')) {
            $subscribe = $extensionAttributes->getSubscribe();
            if ($subscribe !== null) {
                return (bool)$subscribe;
            }
        }

        return null;
    }
}
