<?php

namespace IWD\Opc\Plugin\Checkout;

use Magento\Quote\Api\Data\PaymentInterface;
use Magento\Quote\Api\Data\AddressInterface;

class GuestPaymentInformationManagement extends PaymentMethodManagement
{
    public function aroundSavePaymentInformation(
        $subject,
        callable $proceed,
        $cartId,
        $email,
        PaymentInterface $paymentMethod,
        AddressInterface $billingAddress = null
    ) {
        $result = $proceed($cartId, $email, $paymentMethod, $billingAddress);
        $this->saveCommentToSession($paymentMethod);
        $this->saveSubscribeToSession($paymentMethod);

        return $result;
    }
}
