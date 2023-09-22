<?php

namespace IWD\Opc\Plugin\Checkout;

use Magento\Quote\Api\Data\PaymentInterface;
use Magento\Quote\Api\Data\AddressInterface;

class PaymentInformationManagement extends PaymentMethodManagement
{
    public function aroundSavePaymentInformation(
        $subject,
        callable $proceed,
        $cartId,
        PaymentInterface $paymentMethod,
        AddressInterface $billingAddress = null
    ) {
        $result = $proceed($cartId, $paymentMethod, $billingAddress);
        $this->saveCommentToSession($paymentMethod);
        $this->saveSubscribeToSession($paymentMethod);

        return $result;
    }
}
