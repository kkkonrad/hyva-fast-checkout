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
        $decoded = $this->normalizeFastcheckoutConfig($decoded);
        $this->validateFastcheckoutConfig($decoded);

        if (is_array($value)) {
            $encoded = json_encode($decoded);
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
}
