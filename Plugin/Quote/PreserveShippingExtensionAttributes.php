<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartInterface;

/**
 * Restore third-party shipping-related quote columns / extension attributes when
 * Magento reloads a quote without them (common with parcel-locker modules).
 *
 * Attributes are configured via DI. Defaults include InPost locker id; other
 * carriers can be added without forking this plugin.
 */
class PreserveShippingExtensionAttributes
{
    /**
     * Per-request cache: quoteId|column => value string ('' when DB empty).
     *
     * @var array<string, string>
     */
    private static $lookupCache = [];

    /**
     * @param CartExtensionFactory $cartExtensionFactory
     * @param array<string, array{
     *   column?: string,
     *   extension_getter?: string,
     *   extension_setter?: string,
     *   shipping_method_needles?: string[]
     * }> $attributes
     */
    public function __construct(
        private readonly CartExtensionFactory $cartExtensionFactory,
        private readonly array $attributes = []
    ) {
    }

    /**
     * @param CartRepositoryInterface $subject
     * @param CartInterface $quote
     * @return array
     */
    public function beforeSave(CartRepositoryInterface $subject, CartInterface $quote): array
    {
        if ($quote->isVirtual() || !$quote->getId() || $this->attributes === []) {
            return [$quote];
        }

        $shippingMethod = null;
        $extensionAttributes = $quote->getExtensionAttributes();

        foreach ($this->attributes as $code => $config) {
            if (!is_array($config)) {
                continue;
            }

            $column = (string)($config['column'] ?? $code);
            if ($column === '') {
                continue;
            }

            if ($this->hasValueOnQuote($quote, $extensionAttributes, $config, $column)) {
                continue;
            }

            $needles = $config['shipping_method_needles'] ?? null;
            if (is_array($needles) && $needles !== []) {
                if ($shippingMethod === null) {
                    $shippingMethod = strtolower($this->resolveShippingMethod($quote));
                }
                if (!$this->shippingMethodMatches($shippingMethod, $needles)) {
                    continue;
                }
            }

            $dbValue = $this->loadColumnFromDb($quote, $column);
            if ($dbValue === '') {
                continue;
            }

            $this->applyValue($quote, $extensionAttributes, $config, $column, $dbValue);
            $extensionAttributes = $quote->getExtensionAttributes();
        }

        return [$quote];
    }

    /**
     * @param mixed $extensionAttributes
     * @param array $config
     */
    private function hasValueOnQuote(
        CartInterface $quote,
        $extensionAttributes,
        array $config,
        string $column
    ): bool {
        $getter = (string)($config['extension_getter'] ?? '');
        if (
            $getter !== '' &&
            $extensionAttributes !== null &&
            method_exists($extensionAttributes, $getter)
        ) {
            $value = $extensionAttributes->{$getter}();
            if ($value !== null && $value !== '') {
                return true;
            }
        }

        $data = $quote->getData($column);

        return $data !== null && $data !== '';
    }

    /**
     * @param string[] $needles Plain substrings, or "a&&b" meaning both must appear.
     */
    private function shippingMethodMatches(string $shippingMethod, array $needles): bool
    {
        if ($shippingMethod === '') {
            return false;
        }

        foreach ($needles as $needle) {
            $needle = strtolower(trim((string)$needle));
            if ($needle === '') {
                continue;
            }
            if (strpos($needle, '&&') !== false) {
                $parts = array_filter(array_map('trim', explode('&&', $needle)));
                $all = true;
                foreach ($parts as $part) {
                    if ($part === '' || strpos($shippingMethod, $part) === false) {
                        $all = false;
                        break;
                    }
                }
                if ($all && $parts !== []) {
                    return true;
                }
                continue;
            }
            if (strpos($shippingMethod, $needle) !== false) {
                return true;
            }
        }

        return false;
    }

    private function loadColumnFromDb(CartInterface $quote, string $column): string
    {
        $quoteId = $quote->getId();
        $cacheKey = $quoteId . '|' . $column;
        if (array_key_exists($cacheKey, self::$lookupCache)) {
            return self::$lookupCache[$cacheKey];
        }

        try {
            $connection = $quote->getResource()->getConnection();
            $tableName = $quote->getResource()->getTable('quote');
            // Only select known columns that exist on quote table.
            if (!$connection->tableColumnExists($tableName, $column)) {
                self::$lookupCache[$cacheKey] = '';

                return '';
            }

            $dbValue = $connection->fetchOne(
                $connection->select()->from($tableName, [$column])->where('entity_id = ?', (int)$quoteId)
            );
            $dbValue = $dbValue !== false && $dbValue !== null ? (string)$dbValue : '';
            self::$lookupCache[$cacheKey] = $dbValue;

            return $dbValue;
        } catch (\Throwable $exception) {
            self::$lookupCache[$cacheKey] = '';

            return '';
        }
    }

    /**
     * @param mixed $extensionAttributes
     * @param array $config
     */
    private function applyValue(
        CartInterface $quote,
        $extensionAttributes,
        array $config,
        string $column,
        string $value
    ): void {
        $setter = (string)($config['extension_setter'] ?? '');
        if ($extensionAttributes === null) {
            $extensionAttributes = $this->cartExtensionFactory->create();
        }
        if ($setter !== '' && method_exists($extensionAttributes, $setter)) {
            $extensionAttributes->{$setter}($value);
            $quote->setExtensionAttributes($extensionAttributes);
        }
        $quote->setData($column, $value);
    }

    private function resolveShippingMethod(CartInterface $quote): string
    {
        try {
            $shippingAddress = method_exists($quote, 'getShippingAddress')
                ? $quote->getShippingAddress()
                : null;
            if ($shippingAddress && method_exists($shippingAddress, 'getShippingMethod')) {
                return (string)$shippingAddress->getShippingMethod();
            }
        } catch (\Throwable $exception) {
            return '';
        }

        return '';
    }

    /**
     * Reset static cache (unit tests).
     */
    public static function resetLookupCache(): void
    {
        self::$lookupCache = [];
    }
}
