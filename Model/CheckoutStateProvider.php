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

        return array_values(array_filter($methods, function ($method) use ($allowedCodes): bool {
            return $this->isPaymentMethodAllowedByRules((string)$method->getCode(), $allowedCodes);
        }));
    }

    private function isPaymentMethodAllowedByRules(string $paymentMethodCode, array $shippingAllowedCodes = []): bool
    {
        if ($shippingAllowedCodes !== [] && !$this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $shippingAllowedCodes)) {
            return false;
        }

        if (!$this->helper->isRestrictPaymentEnable()) {
            return true;
        }

        $restrictedPaymentMethods = $this->helper->getRestrictPaymentMethods();
        if ($restrictedPaymentMethods === []) {
            return true;
        }

        return $this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $restrictedPaymentMethods);
    }

    private function getAllowedPaymentMethodCodes($quote): array
    {
        $shippingAddress = $quote ? $quote->getShippingAddress() : null;
        $shippingMethod = $shippingAddress ? (string)$shippingAddress->getShippingMethod() : '';

        if ($shippingMethod === '') {
            return [];
        }

        return $this->helper->getMappedPaymentMethodsForShipping($shippingMethod);
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
                $rateData = [
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

                $extensionAttributes = $this->getShippingRateExtensionAttributes($rate);
                if (!empty($extensionAttributes)) {
                    $rateData['extension_attributes'] = $extensionAttributes;
                }

                $ratesData[] = $rateData;
            }
        }

        return $ratesData;
    }

    private function getShippingRateExtensionAttributes($rate): array
    {
        $extensionAttributes = [];

        if (method_exists($rate, 'getExtensionAttributes')) {
            try {
                $extensionAttributes = $this->normalizeGenericData($rate->getExtensionAttributes());
            } catch (\Throwable $exception) {
                $extensionAttributes = [];
            }
        }

        if (empty($extensionAttributes) && method_exists($rate, 'getData')) {
            try {
                $extensionAttributes = $this->normalizeGenericData($rate->getData('extension_attributes'));
                if (empty($extensionAttributes)) {
                    $extensionAttributes = $this->normalizeGenericData($rate->getData('extensionAttributes'));
                }
            } catch (\Throwable $exception) {
                $extensionAttributes = [];
            }
        }

        return $extensionAttributes;
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

        $totals = $quote->getTotals();
        if ($totals instanceof \Traversable) {
            $totals = iterator_to_array($totals);
        }
        if (!is_array($totals)) {
            $totals = [];
        }

        foreach ($totals as $code => $total) {
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

        $visibleItems = $quote->getAllVisibleItems();
        if ($visibleItems instanceof \Traversable) {
            $visibleItems = iterator_to_array($visibleItems);
        }
        if (!is_array($visibleItems)) {
            $visibleItems = [];
        }

        foreach ($visibleItems as $item) {
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

    private const UNSUPPORTED_GENERIC_VALUE = '__FASTCHECKOUT_UNSUPPORTED_GENERIC_VALUE__';

    private function normalizeGenericData($data): array
    {
        $data = $this->coerceGenericDataArray($data);
        if ($data === null) {
            return [];
        }

        $result = [];
        foreach ($data as $key => $value) {
            if (!is_string($key) && !is_int($key)) {
                continue;
            }

            $attributeData = $this->extractAttributeData($value);
            if ($attributeData !== null) {
                $key = $attributeData['code'];
                $value = $attributeData['value'];
            }

            $value = $this->normalizeGenericValue($value);
            if ($value !== self::UNSUPPORTED_GENERIC_VALUE) {
                $result[(string)$key] = $value;
            }
        }

        return $result;
    }

    private function normalizeGenericValue($value, int $depth = 0)
    {
        if ($depth > 8) {
            return self::UNSUPPORTED_GENERIC_VALUE;
        }

        if ($value === null || is_scalar($value)) {
            return $value;
        }

        if (
            is_object($value) &&
            !method_exists($value, 'toArray') &&
            !($value instanceof \JsonSerializable) &&
            method_exists($value, '__toString')
        ) {
            return (string)$value;
        }

        $arrayValue = $this->coerceGenericDataArray($value);
        if ($arrayValue === null) {
            return self::UNSUPPORTED_GENERIC_VALUE;
        }

        $result = [];
        foreach ($arrayValue as $key => $item) {
            if (!is_string($key) && !is_int($key)) {
                continue;
            }

            $attributeData = $this->extractAttributeData($item);
            if ($attributeData !== null) {
                $key = $attributeData['code'];
                $item = $attributeData['value'];
            }

            $normalized = $this->normalizeGenericValue($item, $depth + 1);
            if ($normalized !== self::UNSUPPORTED_GENERIC_VALUE) {
                $result[(string)$key] = $normalized;
            }
        }

        return $result;
    }

    private function extractAttributeData($attribute): ?array
    {
        if (is_array($attribute) && isset($attribute['attribute_code'])) {
            return [
                'code' => (string)$attribute['attribute_code'],
                'value' => $attribute['value'] ?? null,
            ];
        }

        if (
            is_object($attribute) &&
            method_exists($attribute, 'getAttributeCode') &&
            method_exists($attribute, 'getValue')
        ) {
            try {
                $code = (string)$attribute->getAttributeCode();
                if ($code === '') {
                    return null;
                }

                return [
                    'code' => $code,
                    'value' => $attribute->getValue(),
                ];
            } catch (\Throwable $exception) {
                return null;
            }
        }

        return null;
    }

    private function coerceGenericDataArray($data): ?array
    {
        if (is_array($data)) {
            return $data;
        }

        if (is_object($data)) {
            if (method_exists($data, 'toArray')) {
                try {
                    $arrayData = $data->toArray();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $exception) {
                    return null;
                }
            }

            if (method_exists($data, '__toArray') && is_callable([$data, '__toArray'])) {
                try {
                    $arrayData = $data->__toArray();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $exception) {
                    return null;
                }
            }

            if ($data instanceof \Magento\Framework\DataObject) {
                try {
                    $arrayData = $data->getData();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $exception) {
                    return null;
                }
            }

            if ($data instanceof \JsonSerializable) {
                try {
                    $arrayData = $data->jsonSerialize();
                    return is_array($arrayData) ? $arrayData : null;
                } catch (\Throwable $exception) {
                    return null;
                }
            }

            if (method_exists($data, '__toString')) {
                return ['value' => (string)$data];
            }
        }

        return null;
    }
}
