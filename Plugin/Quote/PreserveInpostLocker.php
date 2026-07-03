<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;

/**
 * Class PreserveInpostLocker
 * Prevents Magewire or other checkout processes from clearing the selected InPost Locker ID
 * if it was saved via AJAX but is missing from the quote object in the current request session.
 */
class PreserveInpostLocker
{
    /**
     * @var CartExtensionFactory
     */
    private $cartExtensionFactory;

    /**
     * PreserveInpostLocker constructor.
     * @param CartExtensionFactory $cartExtensionFactory
     */
    public function __construct(CartExtensionFactory $cartExtensionFactory)
    {
        $this->cartExtensionFactory = $cartExtensionFactory;
    }

    /**
     * Preserve the inpost_locker_id in the database if the quote object lacks it
     *
     * @param CartRepositoryInterface $subject
     * @param CartInterface $quote
     * @return array
     */
    public function beforeSave(CartRepositoryInterface $subject, CartInterface $quote)
    {
        if ($quote->isVirtual()) {
            return [$quote];
        }

        $extensionAttributes = $quote->getExtensionAttributes();
        $currentLockerId = ($extensionAttributes !== null && method_exists($extensionAttributes, 'getInpostLockerId'))
            ? $extensionAttributes->getInpostLockerId()
            : null;

        // If not set on extension attributes, check if it's set as direct data
        if ($currentLockerId === null) {
            $currentLockerId = $quote->getData('inpost_locker_id');
        }

        // If still null, check if we have a saved locker ID in the database
        if ($currentLockerId === null && $quote->getId()) {
            try {
                $connection = $quote->getResource()->getConnection();
                $tableName = $quote->getResource()->getTable('quote');
                $dbLockerId = $connection->fetchOne(
                    $connection->select()->from($tableName, ['inpost_locker_id'])->where('entity_id = ?', (int)$quote->getId())
                );
                
                if ($dbLockerId) {
                    if ($extensionAttributes === null) {
                        $extensionAttributes = $this->cartExtensionFactory->create();
                    }
                    if (method_exists($extensionAttributes, 'setInpostLockerId')) {
                        $extensionAttributes->setInpostLockerId($dbLockerId);
                        $quote->setExtensionAttributes($extensionAttributes);
                    }
                    $quote->setData('inpost_locker_id', $dbLockerId);
                }
            } catch (\Exception $e) {
                // Ignore database read errors to avoid blocking the checkout
            }
        }

        return [$quote];
    }
}
