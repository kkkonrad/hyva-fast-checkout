<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Config\Backend;

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

        $value = (string)$this->getValue();
        if ($value === '') {
            return $this;
        }

        json_decode($value);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new LocalizedException(__('Invalid JSON provided for Fastcheckout configuration.'));
        }

        return $this;
    }
}
