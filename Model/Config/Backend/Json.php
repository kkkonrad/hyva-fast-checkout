<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Config\Backend;

use Kkkonrad\Fastcheckout\Helper\Data as ConfigPaths;
use Magento\Framework\App\Config\Value;
use Magento\Framework\Exception\LocalizedException;

class Json extends Value
{
    /**
     * Validate JSON payload before saving.
     */
    public function beforeSave()
    {
        parent::beforeSave();

        $value = $this->getValue();
        if ($value === '' || $value === null) {
            return $this;
        }

        $decoded = $this->decodeValue($value);
        $normalized = $this->normalizeFastcheckoutConfig($decoded);
        $this->validateFastcheckoutConfig($normalized);

        if (is_array($value) || $normalized !== $decoded) {
            $encoded = json_encode($normalized);
            if ($encoded === false) {
                throw new LocalizedException(__('Invalid JSON provided for Fastcheckout configuration.'));
            }
            $this->setValue($encoded);
        }

        return $this;
    }

    /**
     * @param mixed $value
     * @return mixed
     * @throws LocalizedException
     */
    private function decodeValue($value)
    {
        if (is_array($value)) {
            return $value;
        }

        $decoded = json_decode((string)$value, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new LocalizedException(__('Invalid JSON provided for Fastcheckout configuration.'));
        }

        return $decoded;
    }

    /**
     * @param mixed $decoded
     * @return mixed
     */
    private function normalizeFastcheckoutConfig($decoded)
    {
        if ((string)$this->getPath() === ConfigPaths::XML_PATH_SHIPPING_PAYMENT_MAPPING) {
            return $this->normalizeShippingPaymentMapping($decoded);
        }

        if (
            (string)$this->getPath() === ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS
            || (string)$this->getPath() === ConfigPaths::XML_PATH_REQUIRED_SHIPPING_FIELDS
        ) {
            return $this->normalizeRequiredMethodFields($decoded);
        }

        return $decoded;
    }

    /**
     * @param mixed $decoded
     * @throws LocalizedException
     */
    private function validateFastcheckoutConfig($decoded): void
    {
        $path = (string)$this->getPath();

        if ($path === ConfigPaths::XML_PATH_RESTRICT_PAYMENT_METHODS) {
            $this->validateRestrictedPaymentMethods($decoded);
            return;
        }

        if ($path === ConfigPaths::XML_PATH_SHIPPING_PAYMENT_MAPPING) {
            $this->validateShippingPaymentMapping($decoded);
            return;
        }

        if ($path === ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS) {
            $this->validateRequiredPaymentFields($decoded);
            return;
        }

        if ($path === ConfigPaths::XML_PATH_REQUIRED_SHIPPING_FIELDS) {
            $this->validateRequiredShippingFields($decoded);
        }
    }

    /**
     * @param mixed $decoded
     * @return mixed
     */
    private function normalizeShippingPaymentMapping($decoded)
    {
        if (!is_array($decoded)) {
            return $decoded;
        }

        $mapping = [];
        foreach ($decoded as $key => $row) {
            if (!is_array($row)) {
                if ($row === '' || $row === null) {
                    continue;
                }

                $mapping[$key] = $row;
                continue;
            }

            $shippingMethod = trim((string)($row['shipping_method'] ?? ''));
            $paymentMethod = trim((string)($row['payment_method'] ?? ''));
            if ($shippingMethod === '' || $paymentMethod === '') {
                continue;
            }

            $row['shipping_method'] = $shippingMethod;
            $row['payment_method'] = $paymentMethod;
            $mapping[$key] = $row;
        }

        return $mapping;
    }

    /**
     * @param mixed $decoded
     * @return mixed
     */
    private function normalizeRequiredMethodFields($decoded)
    {
        if (!is_array($decoded)) {
            return $decoded;
        }

        if ($this->containsRequiredMethodFieldRows($decoded)) {
            return $this->normalizeRequiredMethodFieldRows($decoded);
        }

        $mapping = [];
        foreach ($decoded as $methodCode => $fieldPaths) {
            if (!is_array($fieldPaths)) {
                $mapping[$methodCode] = $fieldPaths;
                continue;
            }

            $paths = [];
            foreach ($fieldPaths as $fieldPath) {
                $paths[] = trim((string)$fieldPath);
            }
            $mapping[trim((string)$methodCode)] = $paths;
        }

        return $mapping;
    }

    private function containsRequiredMethodFieldRows(array $value): bool
    {
        foreach ($value as $row) {
            if (is_array($row) && array_key_exists('method_code', $row)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Convert rows submitted by the admin field-array UI to the public
     * method-code => field-paths configuration format.
     */
    private function normalizeRequiredMethodFieldRows(array $rows): array
    {
        $mapping = [];

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $methodCode = trim((string)($row['method_code'] ?? ''));
            if ($methodCode === '') {
                continue;
            }

            $fieldPaths = $row['field_paths'] ?? [];
            if (!is_array($fieldPaths)) {
                $fieldPaths = [$fieldPaths];
            }

            $customPaths = preg_split('/[\r\n,]+/', (string)($row['custom_field_paths'] ?? '')) ?: [];
            foreach (array_merge($fieldPaths, $customPaths) as $fieldPath) {
                $fieldPath = trim((string)$fieldPath);
                if ($fieldPath !== '') {
                    $mapping[$methodCode][] = $fieldPath;
                }
            }
        }

        foreach ($mapping as $methodCode => $fieldPaths) {
            $mapping[$methodCode] = array_values(array_unique($fieldPaths));
        }

        return $mapping;
    }

    /**
     * @param mixed $decoded
     * @throws LocalizedException
     */
    private function validateRestrictedPaymentMethods($decoded): void
    {
        if (!is_array($decoded) || !array_is_list($decoded)) {
            throw new LocalizedException(__('Restricted payment methods must be a JSON array of exact payment method codes.'));
        }

        foreach ($decoded as $paymentMethodCode) {
            $this->validateExactPaymentMethodCode($paymentMethodCode);
        }
    }

    /**
     * @param mixed $decoded
     * @throws LocalizedException
     */
    private function validateShippingPaymentMapping($decoded): void
    {
        if (!is_array($decoded)) {
            throw new LocalizedException(__('Shipping-payment mapping must be a JSON array or object.'));
        }

        foreach ($decoded as $row) {
            if ($row === '' || $row === null) {
                continue;
            }

            if (!is_array($row)) {
                throw new LocalizedException(__('Each shipping-payment mapping row must be an object.'));
            }

            $paymentMethodCode = $row['payment_method'] ?? '';
            if ($paymentMethodCode === '') {
                continue;
            }

            $this->validateExactPaymentMethodCode($paymentMethodCode);
        }
    }

    /**
     * @param mixed $decoded
     * @throws LocalizedException
     */
    private function validateRequiredPaymentFields($decoded): void
    {
        if (!is_array($decoded)) {
            throw new LocalizedException(__('Required payment fields must be a JSON object keyed by exact payment method code.'));
        }

        if ($decoded !== [] && array_is_list($decoded)) {
            throw new LocalizedException(__('Required payment fields must be a JSON object keyed by exact payment method code.'));
        }

        foreach ($decoded as $paymentMethodCode => $fieldPaths) {
            $this->validateExactPaymentMethodCode($paymentMethodCode);

            if (!is_array($fieldPaths) || !array_is_list($fieldPaths)) {
                throw new LocalizedException(__('Required payment field paths must be JSON arrays of strings.'));
            }

            foreach ($fieldPaths as $fieldPath) {
                $this->validateRequiredFieldPath($fieldPath);
            }
        }
    }

    /**
     * @param mixed $decoded
     * @throws LocalizedException
     */
    private function validateRequiredShippingFields($decoded): void
    {
        if (!is_array($decoded)) {
            throw new LocalizedException(__('Required shipping fields must be a JSON object keyed by shipping method code or rule.'));
        }

        if ($decoded !== [] && array_is_list($decoded)) {
            throw new LocalizedException(__('Required shipping fields must be a JSON object keyed by shipping method code or rule.'));
        }

        foreach ($decoded as $shippingMethodRule => $fieldPaths) {
            $this->validateShippingMethodRule($shippingMethodRule);

            if (!is_array($fieldPaths) || !array_is_list($fieldPaths)) {
                throw new LocalizedException(__('Required shipping field paths must be JSON arrays of strings.'));
            }

            foreach ($fieldPaths as $fieldPath) {
                $this->validateRequiredFieldPath($fieldPath);
            }
        }
    }

    /**
     * @param mixed $paymentMethodCode
     * @throws LocalizedException
     */
    private function validateExactPaymentMethodCode($paymentMethodCode): void
    {
        $paymentMethodCode = trim((string)$paymentMethodCode);

        if ($paymentMethodCode === '' || strpos($paymentMethodCode, '*') !== false) {
            throw new LocalizedException(__('Payment methods must use exact method codes. Wildcards such as * or payu_* are not supported.'));
        }
    }

    /**
     * @param mixed $shippingMethodRule
     * @throws LocalizedException
     */
    private function validateShippingMethodRule($shippingMethodRule): void
    {
        $shippingMethodRule = trim((string)$shippingMethodRule);

        if ($shippingMethodRule === '') {
            throw new LocalizedException(__('Shipping method rules must not be empty.'));
        }

        if (strpos($shippingMethodRule, '*') !== false && substr($shippingMethodRule, -1) !== '*') {
            throw new LocalizedException(__('Shipping method wildcards are supported only at the end of a rule.'));
        }
    }

    /**
     * @param mixed $fieldPath
     * @throws LocalizedException
     */
    private function validateRequiredFieldPath($fieldPath): void
    {
        $fieldPath = trim((string)$fieldPath);

        if ($fieldPath === '' || strpos($fieldPath, '*') !== false) {
            throw new LocalizedException(__('Required field paths must be exact field paths.'));
        }

        if (!preg_match('/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/', $fieldPath)) {
            throw new LocalizedException(__('Required field paths may contain only letters, numbers, underscores, hyphens, and dots.'));
        }
    }
}
