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

            // Rates first: may recollect shipping + totals once when rates are stale/empty.
            // Avoid unconditional collectTotals()+save() on every state poll.
            $shippingRates = $this->buildShippingRatesData($quote);
            $this->ensureTotalsCollected($quote);

            $payment = $quote ? $quote->getPayment() : null;
            $selectedPaymentMethod = $selectedPaymentMethod !== ''
                ? $selectedPaymentMethod
                : ($payment ? (string)$payment->getMethod() : '');
            $selectedShippingMethod = $this->getSelectedShippingMethodCode($quote);

            $state = [
                'totals' => $this->buildTotalsData($quote),
                'payment_methods' => $this->buildPaymentMethodsData($quote),
                'shipping_rates' => $shippingRates,
                'selected_payment_method' => $selectedPaymentMethod,
                'selectedPaymentMethod' => $selectedPaymentMethod,
                'paymentMethod' => $selectedPaymentMethod,
                'selected_shipping_method' => $selectedShippingMethod,
                'selectedShippingMethod' => $selectedShippingMethod,
                'selected_shipping_rate' => $selectedShippingMethod,
                'selectedShippingRate' => $selectedShippingMethod,
                'coupon_code' => $quote ? (string)$quote->getCouponCode() : '',
            ];

            $this->saveQuoteIfChanged($quote);

            return $state;
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
                'selectedPaymentMethod' => $selectedPaymentMethod,
                'paymentMethod' => $selectedPaymentMethod,
                'selected_shipping_method' => '',
                'selectedShippingMethod' => '',
                'selected_shipping_rate' => '',
                'selectedShippingRate' => '',
                'coupon_code' => '',
            ];
        }
    }

    /**
     * Collect totals only when Magento has not already done so in this request.
     */
    private function ensureTotalsCollected($quote): void
    {
        if (!$quote || !$quote->getId() || !$quote->hasItems()) {
            return;
        }

        try {
            if (method_exists($quote, 'getTotalsCollectedFlag') && $quote->getTotalsCollectedFlag()) {
                return;
            }
        } catch (\Throwable $exception) {
            // Fall through and collect.
        }

        $quote->collectTotals();
    }

    /**
     * Persist quote only when address/payment/quote data actually changed.
     */
    private function saveQuoteIfChanged($quote): void
    {
        if (!$quote || !$quote->getId() || !$this->quoteHasChanges($quote)) {
            return;
        }

        $this->cartRepository->save($quote);
    }

    private function quoteHasChanges($quote): bool
    {
        try {
            if (method_exists($quote, 'hasDataChanges') && $quote->hasDataChanges()) {
                return true;
            }
        } catch (\Throwable $exception) {
            // Check related objects below.
        }

        foreach (['getShippingAddress', 'getBillingAddress', 'getPayment'] as $getter) {
            try {
                if (!method_exists($quote, $getter)) {
                    continue;
                }
                $related = $quote->{$getter}();
                if ($related && method_exists($related, 'hasDataChanges') && $related->hasDataChanges()) {
                    return true;
                }
            } catch (\Throwable $exception) {
                // Ignore transient access errors during state reads.
            }
        }

        return false;
    }

    private function getSelectedShippingMethodCode($quote): string
    {
        try {
            $shippingAddress = $quote ? $quote->getShippingAddress() : null;

            return $shippingAddress ? (string)$shippingAddress->getShippingMethod() : '';
        } catch (\Throwable $exception) {
            return '';
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

            $methodData = [
                'method' => $code,
                'title' => $title !== '' ? $title : $code,
            ];

            $additionalData = $this->getPaymentMethodAdditionalData($method);
            if (!empty($additionalData)) {
                $methodData['additional_data'] = $additionalData;
                $methodData['additionalData'] = $additionalData;
            }

            $extensionAttributes = $this->getPaymentMethodExtensionAttributes($method);
            if (!empty($extensionAttributes)) {
                $methodData['extension_attributes'] = $extensionAttributes;
                $methodData['extensionAttributes'] = $extensionAttributes;
            }

            $methods[] = $methodData;
        }

        return $methods;
    }

    private function getPaymentMethodAdditionalData($method): array
    {
        if (method_exists($method, 'getAdditionalData')) {
            try {
                $additionalData = $this->normalizeGenericData($method->getAdditionalData());
                if (!empty($additionalData)) {
                    return $additionalData;
                }
            } catch (\Throwable $exception) {
                // Try data keys below.
            }
        }

        return $this->getPaymentMethodDataByKeys($method, ['additional_data', 'additionalData']);
    }

    private function getPaymentMethodExtensionAttributes($method): array
    {
        if (method_exists($method, 'getExtensionAttributes')) {
            try {
                $extensionAttributes = $this->normalizeGenericData($method->getExtensionAttributes());
                if (!empty($extensionAttributes)) {
                    return $extensionAttributes;
                }
            } catch (\Throwable $exception) {
                // Try data keys below.
            }
        }

        return $this->getPaymentMethodDataByKeys($method, ['extension_attributes', 'extensionAttributes']);
    }

    private function getPaymentMethodDataByKeys($method, array $keys): array
    {
        if (!method_exists($method, 'getData')) {
            return [];
        }

        foreach ($keys as $key) {
            try {
                $data = $this->normalizeGenericData($method->getData($key));
                if (!empty($data)) {
                    return $data;
                }
            } catch (\Throwable $exception) {
                // Try the next key.
            }
        }

        return [];
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
        $hasShippingPaymentMapping = $this->helper->hasShippingPaymentMapping();

        return array_values(array_filter($methods, function ($method) use ($allowedCodes, $hasShippingPaymentMapping): bool {
            return $this->isPaymentMethodAllowedByRules(
                (string)$method->getCode(),
                $allowedCodes,
                $hasShippingPaymentMapping
            );
        }));
    }

    private function isPaymentMethodAllowedByRules(
        string $paymentMethodCode,
        array $shippingAllowedCodes = [],
        bool $hasShippingPaymentMapping = false
    ): bool
    {
        if (
            ($hasShippingPaymentMapping || $shippingAllowedCodes !== [])
            && !$this->helper->isPaymentMethodCodeAllowedByRules($paymentMethodCode, $shippingAllowedCodes)
        ) {
            return false;
        }

        return true;
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

                $price = $this->getShippingRateNumericValue($rate, ['price'], 0.0);
                if ($price === 0.0 && method_exists($rate, 'getPrice')) {
                    $price = (float)$rate->getPrice();
                }
                $errorMessage = $this->getShippingRateStringValue($rate, ['error_message', 'errorMessage'], '');
                $rateData = [
                    'carrier_code' => $this->getShippingRateStringValue($rate, ['carrier', 'carrier_code', 'carrierCode'], ''),
                    'method_code' => $this->getShippingRateStringValue($rate, ['method', 'method_code', 'methodCode'], ''),
                    'carrier_title' => $this->getShippingRateStringValue($rate, ['carrier_title', 'carrierTitle'], ''),
                    'method_title' => $this->getShippingRateStringValue($rate, ['method_title', 'methodTitle'], ''),
                    'amount' => $this->getShippingRateNumericValue($rate, ['amount'], $price),
                    'base_amount' => $this->getShippingRateNumericValue($rate, ['base_amount', 'baseAmount'], $price),
                    'price_excl_tax' => $this->getShippingRateNumericValue($rate, ['price_excl_tax', 'priceExclTax'], $price),
                    'price_incl_tax' => $this->getShippingRateNumericValue($rate, ['price_incl_tax', 'priceInclTax'], $price),
                    'available' => $errorMessage === '',
                    'error_message' => $errorMessage,
                ];

                $extensionAttributes = $this->getShippingRateExtensionAttributes($rate);
                if (!empty($extensionAttributes)) {
                    $rateData['extension_attributes'] = $extensionAttributes;
                    $rateData['extensionAttributes'] = $extensionAttributes;
                }

                $customAttributes = $this->getShippingRateCustomAttributes($rate);
                if (!empty($customAttributes)) {
                    $rateData['custom_attributes'] = $customAttributes;
                    $rateData['customAttributes'] = $customAttributes;
                }

                $ratesData[] = $rateData;
            }
        }

        return $ratesData;
    }

    private function getShippingRateStringValue($rate, array $keys, string $default): string
    {
        foreach ($keys as $key) {
            if (method_exists($rate, 'getData')) {
                try {
                    $value = $rate->getData($key);
                    if ($value !== null && $value !== '' && is_scalar($value)) {
                        return (string)$value;
                    }
                } catch (\Throwable $exception) {
                    // Try an explicit getter below.
                }
            }

            $getter = 'get' . str_replace(' ', '', ucwords(str_replace('_', ' ', (string)$key)));
            if (method_exists($rate, $getter)) {
                try {
                    $value = $rate->{$getter}();
                    if ($value !== null && $value !== '' && is_scalar($value)) {
                        return (string)$value;
                    }
                } catch (\Throwable $exception) {
                    // Keep the fallback value.
                }
            }
        }

        return $default;
    }

    private function getShippingRateNumericValue($rate, array $keys, float $default): float
    {
        foreach ($keys as $key) {
            if (method_exists($rate, 'getData')) {
                try {
                    $value = $rate->getData($key);
                    if ($value !== null && $value !== '' && is_numeric($value)) {
                        return (float)$value;
                    }
                } catch (\Throwable $exception) {
                    // Try an explicit getter below.
                }
            }

            $getter = 'get' . str_replace(' ', '', ucwords(str_replace('_', ' ', (string)$key)));
            if (method_exists($rate, $getter)) {
                try {
                    $value = $rate->{$getter}();
                    if ($value !== null && $value !== '' && is_numeric($value)) {
                        return (float)$value;
                    }
                } catch (\Throwable $exception) {
                    // Keep the fallback value.
                }
            }
        }

        return $default;
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

    private function getShippingRateCustomAttributes($rate): array
    {
        if (method_exists($rate, 'getCustomAttributes')) {
            try {
                $customAttributes = $this->normalizeGenericData($rate->getCustomAttributes());
                if (!empty($customAttributes)) {
                    return $customAttributes;
                }
            } catch (\Throwable $exception) {
                // Try data keys below.
            }
        }

        if (!method_exists($rate, 'getData')) {
            return [];
        }

        try {
            $customAttributes = $this->normalizeGenericData($rate->getData('custom_attributes'));
            if (!empty($customAttributes)) {
                return $customAttributes;
            }

            return $this->normalizeGenericData($rate->getData('customAttributes'));
        } catch (\Throwable $exception) {
            return [];
        }
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
        if (is_array($attribute) && (isset($attribute['attribute_code']) || isset($attribute['attributeCode']))) {
            return [
                'code' => (string)($attribute['attribute_code'] ?? $attribute['attributeCode']),
                'value' => $attribute['value'] ?? null,
            ];
        }

        if (is_array($attribute) && array_key_exists('value', $attribute)) {
            $code = null;
            if (array_key_exists('code', $attribute) && !$this->hasUnsupportedAttributeArrayKeys($attribute, ['code', 'value', 'label'])) {
                $code = $attribute['code'];
            } elseif (array_key_exists('name', $attribute) && !$this->hasUnsupportedAttributeArrayKeys($attribute, ['name', 'value', 'label'])) {
                $code = $attribute['name'];
            }

            if ($code !== null && (string)$code !== '') {
                return [
                    'code' => (string)$code,
                    'value' => $attribute['value'],
                ];
            }
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

        if (is_object($attribute) && method_exists($attribute, 'getValue')) {
            try {
                $code = null;
                if (method_exists($attribute, 'getCode')) {
                    $code = $attribute->getCode();
                } elseif (method_exists($attribute, 'getName')) {
                    $code = $attribute->getName();
                }

                if ($code !== null && (string)$code !== '') {
                    return [
                        'code' => (string)$code,
                        'value' => $attribute->getValue(),
                    ];
                }
            } catch (\Throwable $exception) {
                return null;
            }
        }

        return null;
    }

    private function hasUnsupportedAttributeArrayKeys(array $attribute, array $supportedKeys): bool
    {
        foreach (array_keys($attribute) as $key) {
            if (!in_array((string)$key, $supportedKeys, true)) {
                return true;
            }
        }

        return false;
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
