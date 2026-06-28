<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Payments;

class Info
{
    /**
     * Reject non-scalar additional payment information values to avoid Magento errors
     * when payment extensions try to store unsupported objects.
     */
    public function aroundSetAdditionalInformation(
        $subject,
        callable $proceed,
        $key,
        $value = null
    ) {
        if (is_object($value) && !($value instanceof \Stringable)) {
            return $subject;
        }

        return $proceed($key, $value);
    }
}
