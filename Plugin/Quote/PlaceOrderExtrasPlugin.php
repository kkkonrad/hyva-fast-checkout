<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\Data\PaymentInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;

/** Capture Fastcheckout extras for the quote whose native payment data is saved. */
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

        $extensionAttributes = $paymentMethod->getExtensionAttributes();
        $comment = $extensionAttributes && method_exists($extensionAttributes, 'getComment')
            ? $extensionAttributes->getComment()
            : null;
        $subscribe = $extensionAttributes && method_exists($extensionAttributes, 'getSubscribe')
            ? $extensionAttributes->getSubscribe()
            : null;

        if ($comment === null && $subscribe === null) {
            return [$cartId, $paymentMethod];
        }

        $this->checkoutSession->setFastcheckoutQuoteId((string)$cartId);
        $comment = trim((string)$comment);
        if ($comment === '') {
            $this->checkoutSession->unsFastcheckoutComment();
        } else {
            $this->checkoutSession->setFastcheckoutComment($comment);
        }

        if ($subscribe === null) {
            $this->checkoutSession->unsFastcheckoutSubscribe();
        } else {
            $this->checkoutSession->setFastcheckoutSubscribe($subscribe ? 1 : 0);
        }

        return [$cartId, $paymentMethod];
    }
}
