<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use Psr\Log\LoggerInterface;

class CheckoutStateProvider
{
    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @var CartRepositoryInterface
     */
    private $cartRepository;

    /**
     * @var PaymentMethodManagementInterface
     */
    private $paymentMethodManagement;

    /**
     * @var Helper
     */
    private $helper;

    /**
     * @var LoggerInterface
     */
    private $logger;

    public function __construct(
        CheckoutSession $checkoutSession,
        CartRepositoryInterface $cartRepository,
        PaymentMethodManagementInterface $paymentMethodManagement,
        Helper $helper,
        LoggerInterface $logger
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->cartRepository = $cartRepository;
        $this->paymentMethodManagement = $paymentMethodManagement;
        $this->helper = $helper;
        $this->logger = $logger;
    }

    public function getState(string $selectedPaymentMethod = ''): array
    {
        try {
            $quote = $this->checkoutSession->getQuote();

            if ($quote && $quote->getId() && $quote->hasItems()) {
                $quote->collectTotals();
                $this->cartRepository->save($quote);
            }

            $payment = $quote ? $quote->getPayment() : null;
            $selectedPaymentMethod = $selectedPaymentMethod !== ''
                ? $selectedPaymentMethod
                : ($payment ? (string)$payment->getMethod() : '');

            return [
                'totals' => $this->buildTotalsData($quote),
                'payment_methods' => $this->buildPaymentMethodsData($quote),
                'shipping_rates' => $this->buildShippingRatesData($quote),
                'selected_payment_method' => $selectedPaymentMethod,
                'coupon_code' => $quote ? (string)$quote->getCouponCode() : '',
            ];
        } catch (\Throwable $exception) {
            $this->logger->error(
                'Kkkonrad Fastcheckout checkout state error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return [
                'totals' => [
                    'items' => [],
                    'total_segments' => [],
                    'subtotal' => 0.0,
                    'subtotal_with_discount' => 0.0,
                    'grand_total' => 0.0,
                ],
                'payment_methods' => [],
                'shipping_rates' => [],
                'selected_payment_method' => $selectedPaymentMethod,
                'coupon_code' => '',
            ];
        }
    }

    private function buildPaymentMethodsData($quote): array
    {
        $methods = [];

        if (!$quote || !$quote->getId()) {
            return $methods;
        }

        foreach ($this->getAllowedPaymentMethods($quote) as $method) {
            $code = (string)$method->getCode();
            $title = method_exists($method, 'getTitle') ? (string)$method->getTitle() : $code;

            $methods[] = [
                'method' => $code,
                'title' => $title !== '' ? $title : $code,
            ];
        }

        return $methods;
    }

    private function getAllowedPaymentMethods($quote): array
    {
        try {
            $methods = $this->paymentMethodManagement->getList($quote->getId());
        } catch (\Throwable $exception) {
            $this->logger->warning(
                'Kkkonrad Fastcheckout payment method list error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );

            return [];
        }

        $allowedCodes = $this->getAllowedPaymentMethodCodes($quote);
        if ($allowedCodes === []) {
            return $methods;
        }

        return array_values(array_filter($methods, static function ($method) use ($allowedCodes): bool {
            return in_array($method->getCode(), $allowedCodes, true);
        }));
    }

    private function getAllowedPaymentMethodCodes($quote): array
    {
        $shippingAddress = $quote ? $quote->getShippingAddress() : null;
        $shippingMethod = $shippingAddress ? (string)$shippingAddress->getShippingMethod() : '';

        if ($shippingMethod === '') {
            return [];
        }

        $mapping = $this->helper->getShippingPaymentMapping();
        if (empty($mapping)) {
            return [];
        }

        $mappedPayments = [];
        foreach ($mapping as $rule) {
            if (
                isset($rule['shipping_method'], $rule['payment_method']) &&
                $rule['shipping_method'] === $shippingMethod
            ) {
                $mappedPayments[] = $rule['payment_method'];
            }
        }

        return array_values(array_unique($mappedPayments));
    }

    private function buildShippingRatesData($quote): array
    {
        $ratesData = [];

        if (!$quote || $quote->isVirtual()) {
            return $ratesData;
        }

        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress || !$shippingAddress->getCountryId()) {
            return $ratesData;
        }

        $rates = $shippingAddress->getGroupedAllShippingRates();
        if ($shippingAddress->getCollectShippingRates() || empty($rates)) {
            $shippingAddress->setCollectShippingRates(true);
            $quote->collectTotals();
            $rates = $shippingAddress->getGroupedAllShippingRates();
        }

        foreach ($rates as $carrierRates) {
            if ($carrierRates instanceof \Traversable) {
                $carrierRates = iterator_to_array($carrierRates);
            }
            if (!is_array($carrierRates)) {
                $carrierRates = [$carrierRates];
            }

            foreach ($carrierRates as $rate) {
                if (!$rate) {
                    continue;
                }

                $price = (float)$rate->getPrice();
                $ratesData[] = [
                    'carrier_code' => (string)$rate->getCarrier(),
                    'method_code' => (string)$rate->getMethod(),
                    'carrier_title' => (string)$rate->getCarrierTitle(),
                    'method_title' => (string)$rate->getMethodTitle(),
                    'amount' => $price,
                    'base_amount' => $price,
                    'price_excl_tax' => $price,
                    'price_incl_tax' => $price,
                    'available' => !$rate->getErrorMessage(),
                    'error_message' => (string)$rate->getErrorMessage(),
                ];
            }
        }

        return $ratesData;
    }

    private function buildTotalsData($quote): array
    {
        if (!$quote) {
            return [
                'items' => [],
                'total_segments' => [],
                'subtotal' => 0.0,
                'subtotal_with_discount' => 0.0,
                'grand_total' => 0.0,
            ];
        }

        $totalsData = [
            'items' => $this->buildTotalsItemsData($quote),
            'total_segments' => [],
            'subtotal' => (float)$quote->getSubtotal(),
            'subtotal_with_discount' => (float)$quote->getSubtotalWithDiscount(),
            'grand_total' => (float)$quote->getGrandTotal(),
            'coupon_code' => (string)$quote->getCouponCode(),
        ];

        foreach ($quote->getTotals() as $code => $total) {
            $value = (float)$total->getValue();
            $totalsData[(string)$code] = $value;
            $totalsData['total_segments'][] = [
                'code' => (string)$code,
                'title' => (string)$total->getTitle(),
                'value' => $value,
            ];
        }

        if ($totalsData['subtotal_with_discount'] === 0.0) {
            $totalsData['subtotal_with_discount'] = $totalsData['subtotal'];
        }

        return $totalsData;
    }

    private function buildTotalsItemsData($quote): array
    {
        $items = [];

        foreach ($quote->getAllVisibleItems() as $item) {
            $items[] = [
                'item_id' => (int)$item->getId(),
                'name' => (string)$item->getName(),
                'qty' => (float)$item->getQty(),
                'price' => (float)$item->getPrice(),
                'row_total' => (float)$item->getRowTotal(),
            ];
        }

        return $items;
    }
}
