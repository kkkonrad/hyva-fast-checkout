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
 *
 * DB lookup is intentionally narrow: only for non-virtual quotes with an InPost-like shipping
 * method and a missing locker id (avoids an extra SELECT on every cart save site-wide).
 */
class PreserveInpostLocker
{
    /**
     * Per-request cache: quote id => locker id string, or empty string when DB has none.
     *
     * @var array<int|string, string>
     */
    private static $lockerLookupCache = [];

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
        if ($quote->isVirtual() || !$quote->getId()) {
            return [$quote];
        }

        $extensionAttributes = $quote->getExtensionAttributes();
        $currentLockerId = ($extensionAttributes !== null && method_exists($extensionAttributes, 'getInpostLockerId'))
            ? $extensionAttributes->getInpostLockerId()
            : null;

        // If not set on extension attributes, check if it's set as direct data
        if ($currentLockerId === null || $currentLockerId === '') {
            $currentLockerId = $quote->getData('inpost_locker_id');
        }

        // Already present on the in-memory quote — nothing to restore.
        if ($currentLockerId !== null && $currentLockerId !== '') {
            return [$quote];
        }

        // Skip expensive DB round-trip when shipping is not an InPost pickup method.
        if (!$this->isInpostPickupShippingMethod($this->resolveShippingMethod($quote))) {
            return [$quote];
        }

        $quoteId = $quote->getId();
        if (array_key_exists($quoteId, self::$lockerLookupCache)) {
            $dbLockerId = self::$lockerLookupCache[$quoteId];
            if ($dbLockerId !== '') {
                $this->applyLockerId($quote, $extensionAttributes, $dbLockerId);
            }

            return [$quote];
        }

        try {
            $connection = $quote->getResource()->getConnection();
            $tableName = $quote->getResource()->getTable('quote');
            $dbLockerId = $connection->fetchOne(
                $connection->select()->from($tableName, ['inpost_locker_id'])->where('entity_id = ?', (int)$quoteId)
            );

            $dbLockerId = $dbLockerId !== false && $dbLockerId !== null ? (string)$dbLockerId : '';
            self::$lockerLookupCache[$quoteId] = $dbLockerId;

            if ($dbLockerId !== '') {
                $this->applyLockerId($quote, $extensionAttributes, $dbLockerId);
            }
        } catch (\Exception $e) {
            // Ignore database read errors to avoid blocking the checkout
        }

        return [$quote];
    }

    /**
     * @param CartInterface $quote
     * @return string
     */
    private function resolveShippingMethod(CartInterface $quote): string
    {
        try {
            $shippingAddress = method_exists($quote, 'getShippingAddress') ? $quote->getShippingAddress() : null;
            if ($shippingAddress && method_exists($shippingAddress, 'getShippingMethod')) {
                return (string)$shippingAddress->getShippingMethod();
            }
        } catch (\Throwable $exception) {
            return '';
        }

        return '';
    }

    /**
     * Align with Magewire\Checkout::isInpostPickupShippingMethod heuristics.
     */
    private function isInpostPickupShippingMethod(string $shippingMethod): bool
    {
        $shippingMethod = strtolower(trim($shippingMethod));
        if ($shippingMethod === '') {
            return false;
        }

        return strpos($shippingMethod, 'inpostlocker') !== false
            || (
                strpos($shippingMethod, 'inpost') !== false
                && strpos($shippingMethod, 'locker') !== false
            );
    }

    /**
     * @param CartInterface $quote
     * @param mixed $extensionAttributes
     * @param string $lockerId
     * @return void
     */
    private function applyLockerId(CartInterface $quote, $extensionAttributes, string $lockerId): void
    {
        if ($extensionAttributes === null) {
            $extensionAttributes = $this->cartExtensionFactory->create();
        }
        if (method_exists($extensionAttributes, 'setInpostLockerId')) {
            $extensionAttributes->setInpostLockerId($lockerId);
            $quote->setExtensionAttributes($extensionAttributes);
        }
        $quote->setData('inpost_locker_id', $lockerId);
    }
}
