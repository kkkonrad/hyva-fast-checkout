<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartInterface;

/**
 * @deprecated Use PreserveShippingExtensionAttributes (auto-discovery).
 * Kept as a thin BC wrapper for unit tests / external references.
 */
class PreserveInpostLocker
{
    private PreserveShippingExtensionAttributes $preserver;

    public function __construct(CartExtensionFactory $cartExtensionFactory)
    {
        // Explicit InPost map only when ExtensionAttribute\Config is unavailable (unit tests).
        $this->preserver = new PreserveShippingExtensionAttributes(
            $cartExtensionFactory,
            null,
            [
                'inpost_locker_id' => [
                    'column' => 'inpost_locker_id',
                    'extension_getter' => 'getInpostLockerId',
                    'extension_setter' => 'setInpostLockerId',
                ],
            ]
        );
    }

    /**
     * @param CartRepositoryInterface $subject
     * @param CartInterface $quote
     * @return array
     */
    public function beforeSave(CartRepositoryInterface $subject, CartInterface $quote): array
    {
        return $this->preserver->beforeSave($subject, $quote);
    }
}
