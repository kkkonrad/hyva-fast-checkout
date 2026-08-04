<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartInterface;

/**
 * Backward-compatible InPost entry point.
 *
 * Prefer {@see PreserveShippingExtensionAttributes} with DI attribute config.
 * This class remains for existing tests and any external references; it
 * delegates to the generic preserver with InPost defaults.
 */
class PreserveInpostLocker
{
    private PreserveShippingExtensionAttributes $preserver;

    public function __construct(CartExtensionFactory $cartExtensionFactory)
    {
        $this->preserver = new PreserveShippingExtensionAttributes(
            $cartExtensionFactory,
            [
                'inpost_locker_id' => [
                    'column' => 'inpost_locker_id',
                    'extension_getter' => 'getInpostLockerId',
                    'extension_setter' => 'setInpostLockerId',
                    'shipping_method_needles' => [
                        'inpostlocker',
                        'inpost&&locker',
                    ],
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
