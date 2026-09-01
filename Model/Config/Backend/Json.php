<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Config\Backend;

use Magento\Config\Model\Config\Backend\Serialized\ArraySerialized;
use Magento\Framework\Exception\LocalizedException;

class Json extends ArraySerialized
{
    public function beforeSave()
    {
        $value = $this->getValue();
        if ($value === '' || $value === null) {
            return parent::beforeSave();
        }
        if (!is_array($value)) {
            throw new LocalizedException(__('Shipping-payment mapping must be a JSON array or object.'));
        }

        $mapping = [];
        foreach ($value as $key => $row) {
            if ($row === '' || $row === null) {
                continue;
            }
            if (!is_array($row)) {
                throw new LocalizedException(__('Each shipping-payment mapping row must be an object.'));
            }

            $shipping = trim((string)($row['shipping_method'] ?? ''));
            $payment = trim((string)($row['payment_method'] ?? ''));
            if ($shipping === '' || $payment === '') {
                continue;
            }
            if (str_contains($payment, '*')) {
                throw new LocalizedException(
                    __('Payment methods must use exact method codes. Wildcards such as * or payu_* are not supported.')
                );
            }

            $row['shipping_method'] = $shipping;
            $row['payment_method'] = $payment;
            $mapping[$key] = $row;
        }

        $this->setValue($mapping);
        return parent::beforeSave();
    }
}
