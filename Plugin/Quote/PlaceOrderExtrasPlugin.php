<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\AddressComparatorInterface;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\RequestInterface;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\PaymentInterface;

/**
 * Capture Fastcheckout extras (comment / newsletter) before native placeOrder.
 * Comment is later persisted by QuoteSubmitSuccess from checkout session.
 *
 * Client must send registered PaymentInterface extension attributes only:
 * comment, subscribe (see etc/extension_attributes.xml). Legacy keys
 * fastcheckout_comment / fastcheckout_subscribe are still accepted from
 * additional_data and raw JSON for backward compatibility.
 */
class PlaceOrderExtrasPlugin
{
    /** @var CheckoutSession */
    private $checkoutSession;

    /** @var Helper */
    private $helper;

    /** @var RequestInterface */
    private $request;

    /** @var CartRepositoryInterface */
    private $quoteRepository;

    /** @var AddressComparatorInterface */
    private $addressComparator;

    public function __construct(
        CheckoutSession $checkoutSession,
        Helper $helper,
        RequestInterface $request,
        CartRepositoryInterface $quoteRepository,
        AddressComparatorInterface $addressComparator
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->helper = $helper;
        $this->request = $request;
        $this->quoteRepository = $quoteRepository;
        $this->addressComparator = $addressComparator;
    }

    /**
     * @param CartManagementInterface $subject
     * @param int $cartId
     * @param PaymentInterface|null $paymentMethod
     * @return array
     */
    public function beforePlaceOrder(
        CartManagementInterface $subject,
        $cartId,
        PaymentInterface $paymentMethod = null
    ): array {
        if (!$this->helper->isEnable()) {
            return [$cartId, $paymentMethod];
        }

        $quote = $this->quoteRepository->getActive($cartId);
        $shipping = $quote->getShippingAddress();
        $billing = $quote->getBillingAddress();
        if (
            $shipping->getSaveInAddressBook()
            && $billing->getSaveInAddressBook()
            && $this->addressComparator->isEqual($shipping, $billing)
        ) {
            $billing->setSaveInAddressBook(0);
            $this->quoteRepository->save($quote);
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

    private function extractComment(?PaymentInterface $paymentMethod): string
    {
        if ($paymentMethod) {
            $additional = $paymentMethod->getAdditionalData();
            if (is_array($additional)) {
                foreach (['fastcheckout_comment', 'comment'] as $key) {
                    if (!empty($additional[$key])) {
                        return trim((string)$additional[$key]);
                    }
                }
            }
            $ext = $paymentMethod->getExtensionAttributes();
            if ($ext && is_object($ext)) {
                if (method_exists($ext, 'getComment')) {
                    $value = $ext->getComment();
                    if ($value !== null && trim((string)$value) !== '') {
                        return trim((string)$value);
                    }
                }
                $data = method_exists($ext, '__toArray') ? $ext->__toArray() : [];
                foreach (['comment', 'fastcheckout_comment'] as $key) {
                    if (!empty($data[$key])) {
                        return trim((string)$data[$key]);
                    }
                }
            }
        }

        $content = (string)$this->request->getContent();
        if ($content !== '') {
            $json = json_decode($content, true);
            if (is_array($json)) {
                $ext = $json['paymentMethod']['extension_attributes']
                    ?? $json['payment_method']['extension_attributes']
                    ?? [];
                if (is_array($ext)) {
                    foreach (['comment', 'fastcheckout_comment'] as $key) {
                        if (!empty($ext[$key])) {
                            return trim((string)$ext[$key]);
                        }
                    }
                }
                $additional = $json['paymentMethod']['additional_data']
                    ?? $json['payment_method']['additional_data']
                    ?? [];
                if (is_array($additional)) {
                    foreach (['fastcheckout_comment', 'comment'] as $key) {
                        if (!empty($additional[$key])) {
                            return trim((string)$additional[$key]);
                        }
                    }
                }
            }
        }

        return '';
    }

    private function extractSubscribe(?PaymentInterface $paymentMethod): ?bool
    {
        if ($paymentMethod) {
            $additional = $paymentMethod->getAdditionalData();
            if (is_array($additional)) {
                foreach (['fastcheckout_subscribe', 'subscribe'] as $key) {
                    if (array_key_exists($key, $additional)) {
                        return (bool)$additional[$key];
                    }
                }
            }
            $ext = $paymentMethod->getExtensionAttributes();
            if ($ext && is_object($ext)) {
                if (method_exists($ext, 'getSubscribe')) {
                    $value = $ext->getSubscribe();
                    if ($value !== null) {
                        return (bool)$value;
                    }
                }
                $data = method_exists($ext, '__toArray') ? $ext->__toArray() : [];
                foreach (['subscribe', 'fastcheckout_subscribe'] as $key) {
                    if (array_key_exists($key, $data) && $data[$key] !== null) {
                        return (bool)$data[$key];
                    }
                }
            }
        }

        $content = (string)$this->request->getContent();
        if ($content !== '') {
            $json = json_decode($content, true);
            if (is_array($json)) {
                $ext = $json['paymentMethod']['extension_attributes']
                    ?? $json['payment_method']['extension_attributes']
                    ?? [];
                if (is_array($ext)) {
                    foreach (['subscribe', 'fastcheckout_subscribe'] as $key) {
                        if (array_key_exists($key, $ext) && $ext[$key] !== null) {
                            return (bool)$ext[$key];
                        }
                    }
                }
                $additional = $json['paymentMethod']['additional_data']
                    ?? $json['payment_method']['additional_data']
                    ?? [];
                if (is_array($additional)) {
                    foreach (['fastcheckout_subscribe', 'subscribe'] as $key) {
                        if (array_key_exists($key, $additional)) {
                            return (bool)$additional[$key];
                        }
                    }
                }
            }
        }

        return null;
    }
}
