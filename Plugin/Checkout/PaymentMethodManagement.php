<?php

namespace IWD\Opc\Plugin\Checkout;

use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\Data\PaymentInterface;

class PaymentMethodManagement
{
    public $opcHelper;
    public $checkoutSession;

    public function __construct(
        OpcHelper $opcHelper,
        CheckoutSession $checkoutSession
    ) {
        $this->opcHelper = $opcHelper;
        $this->checkoutSession = $checkoutSession;
    }

    public function aroundSet(
        $subject,
        callable $proceed,
        $cartId,
        PaymentInterface $method
    ) {
        $result = $proceed($cartId, $method);
        $this->saveCommentToSession($method);
        $this->saveSubscribeToSession($method);

        return $result;
    }

    public function saveCommentToSession(
        PaymentInterface $paymentMethod
    ) {
        if ($this->opcHelper->isShowComment()) {
            $comment = $paymentMethod->getExtensionAttributes() === null
                ? ''
	            : ($paymentMethod->getExtensionAttributes()->getComment()
		            ? trim($paymentMethod->getExtensionAttributes()->getComment())
		            : '');

            $this->checkoutSession->setIwdOpcComment($comment);
        }
    }

    public function saveSubscribeToSession(
        PaymentInterface $paymentMethod
    ) {
        if ($this->opcHelper->isShowSubscribe()) {
            $subscribe = $paymentMethod->getExtensionAttributes() === null
                ? false
                : $paymentMethod->getExtensionAttributes()->getSubscribe();
            $this->checkoutSession->setIwdOpcSubscribe($subscribe);
        }
    }
}
