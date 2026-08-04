<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Quote;

use Magento\Framework\Api\ExtensionAttribute\Config as ExtensionAttributeConfig;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Model\Quote\Address as QuoteAddress;

/**
 * Re-hydrate third-party quote / shipping-address fields that Magento may drop from
 * the in-memory quote during Fastcheckout (same data stock OPC keeps via session).
 *
 * Discovery (no per-vendor DI):
 *  - scalar extension attributes on CartInterface and AddressInterface from
 *    Magento's merged extension_attributes.xml (every installed module);
 *  - for each attribute, if the matching DB column exists on quote / quote_address
 *    and the in-memory value is empty, restore from DB.
 *
 * Complex types (interfaces, arrays, joins only) are skipped — Magento JoinProcessor
 * already loads those on repository get().
 *
 * Optional $attributes DI map remains only for unit tests / rare overrides; production
 * di.xml should leave it empty so install-module-only works like Magento_Checkout.
 */
class PreserveShippingExtensionAttributes
{
    /**
     * @var array<string, string>
     */
    private static $lookupCache = [];

    /**
     * @param CartExtensionFactory $cartExtensionFactory
     * @param ExtensionAttributeConfig|null $extensionAttributeConfig
     * @param array<string, array> $attributes Optional override map (tests / emergency)
     */
    public function __construct(
        private readonly CartExtensionFactory $cartExtensionFactory,
        private readonly ?ExtensionAttributeConfig $extensionAttributeConfig = null,
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
        if ($quote->isVirtual() || !$quote->getId()) {
            return [$quote];
        }

        $this->preserveCartAttributes($quote);
        $this->preserveShippingAddressAttributes($quote);

        return [$quote];
    }

    private function preserveCartAttributes(CartInterface $quote): void
    {
        $extensionAttributes = $quote->getExtensionAttributes();
        foreach ($this->resolveCartAttributeMap() as $code => $config) {
            $column = (string)($config['column'] ?? $code);
            if ($column === '' || $this->hasValueOnEntity($quote, $extensionAttributes, $config, $column)) {
                continue;
            }
            $dbValue = $this->loadColumnFromTable($quote, 'quote', 'entity_id', (int)$quote->getId(), $column);
            if ($dbValue === '') {
                continue;
            }
            $this->applyToCart($quote, $extensionAttributes, $config, $column, $dbValue);
            $extensionAttributes = $quote->getExtensionAttributes();
        }
    }

    private function preserveShippingAddressAttributes(CartInterface $quote): void
    {
        if (!method_exists($quote, 'getShippingAddress')) {
            return;
        }
        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress || !method_exists($shippingAddress, 'getId') || !(int)$shippingAddress->getId()) {
            return;
        }

        $extensionAttributes = method_exists($shippingAddress, 'getExtensionAttributes')
            ? $shippingAddress->getExtensionAttributes()
            : null;

        foreach ($this->resolveAddressAttributeMap() as $code => $config) {
            $column = (string)($config['column'] ?? $code);
            if ($column === '' || $this->hasValueOnEntity($shippingAddress, $extensionAttributes, $config, $column)) {
                continue;
            }
            $dbValue = $this->loadColumnFromTable(
                $quote,
                'quote_address',
                'address_id',
                (int)$shippingAddress->getId(),
                $column
            );
            if ($dbValue === '') {
                continue;
            }
            $this->applyToAddress($shippingAddress, $extensionAttributes, $config, $column, $dbValue);
            $extensionAttributes = method_exists($shippingAddress, 'getExtensionAttributes')
                ? $shippingAddress->getExtensionAttributes()
                : null;
        }
    }

    /**
     * @return array<string, array{column: string, extension_getter: string, extension_setter: string}>
     */
    private function resolveCartAttributeMap(): array
    {
        return $this->mergeMaps(
            $this->discoverScalarAttributes(CartInterface::class),
            $this->normalizeConfiguredAttributes($this->attributes)
        );
    }

    /**
     * @return array<string, array{column: string, extension_getter: string, extension_setter: string}>
     */
    private function resolveAddressAttributeMap(): array
    {
        // Address attributes come only from discovery (no legacy DI list for address).
        return $this->discoverScalarAttributes(AddressInterface::class);
    }

    /**
     * @param class-string $type
     * @return array<string, array{column: string, extension_getter: string, extension_setter: string}>
     */
    private function discoverScalarAttributes(string $type): array
    {
        $map = [];
        if ($this->extensionAttributeConfig === null) {
            return $map;
        }

        try {
            $all = $this->extensionAttributeConfig->get();
        } catch (\Throwable $exception) {
            return $map;
        }

        $attributes = is_array($all[$type] ?? null) ? $all[$type] : [];
        foreach ($attributes as $code => $meta) {
            $code = (string)$code;
            if ($code === '' || !$this->isScalarExtensionAttribute($meta)) {
                continue;
            }
            $map[$code] = $this->attributeConfigFromCode($code);
        }

        return $map;
    }

    /**
     * @param mixed $meta
     */
    private function isScalarExtensionAttribute($meta): bool
    {
        if (!is_array($meta)) {
            return true;
        }
        $type = (string)($meta['type'] ?? 'string');
        if ($type === '' || $type === 'string' || $type === 'int' || $type === 'integer'
            || $type === 'float' || $type === 'double' || $type === 'bool' || $type === 'boolean'
        ) {
            return true;
        }
        // Skip object graphs and arrays (Interface, [], Magento\...\Api\Data\...)
        if (strpos($type, '[]') !== false || strpos($type, 'Interface') !== false
            || strpos($type, '\\') !== false
        ) {
            return false;
        }

        return true;
    }

    /**
     * @return array{column: string, extension_getter: string, extension_setter: string}
     */
    private function attributeConfigFromCode(string $code): array
    {
        $studly = str_replace(' ', '', ucwords(str_replace('_', ' ', $code)));

        return [
            'column' => $code,
            'extension_getter' => 'get' . $studly,
            'extension_setter' => 'set' . $studly,
        ];
    }

    /**
     * @param array $configured
     * @return array<string, array>
     */
    private function normalizeConfiguredAttributes(array $configured): array
    {
        $map = [];
        foreach ($configured as $code => $config) {
            if (!is_array($config)) {
                continue;
            }
            $code = (string)$code;
            $base = $this->attributeConfigFromCode($code);
            $map[$code] = [
                'column' => (string)($config['column'] ?? $base['column']),
                'extension_getter' => (string)($config['extension_getter'] ?? $base['extension_getter']),
                'extension_setter' => (string)($config['extension_setter'] ?? $base['extension_setter']),
            ];
        }

        return $map;
    }

    /**
     * Configured map overrides discovery for the same code (tests / emergency).
     *
     * @param array $discovered
     * @param array $configured
     * @return array
     */
    private function mergeMaps(array $discovered, array $configured): array
    {
        return $configured + $discovered;
    }

    /**
     * @param object $entity Quote or address
     * @param mixed $extensionAttributes
     * @param array $config
     */
    private function hasValueOnEntity(
        object $entity,
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
            if ($value !== null && $value !== '' && $value !== []) {
                return true;
            }
        }

        if (method_exists($entity, 'getData')) {
            $data = $entity->getData($column);
            if ($data !== null && $data !== '' && $data !== []) {
                return true;
            }
        }

        return false;
    }

    private function loadColumnFromTable(
        CartInterface $quote,
        string $tableLogical,
        string $idColumn,
        int $entityId,
        string $column
    ): string {
        if ($entityId <= 0) {
            return '';
        }
        $cacheKey = $tableLogical . '|' . $entityId . '|' . $column;
        if (array_key_exists($cacheKey, self::$lookupCache)) {
            return self::$lookupCache[$cacheKey];
        }

        try {
            if (!method_exists($quote, 'getResource')) {
                self::$lookupCache[$cacheKey] = '';

                return '';
            }
            $connection = $quote->getResource()->getConnection();
            $tableName = $quote->getResource()->getTable($tableLogical);
            if (!$connection->tableColumnExists($tableName, $column)) {
                self::$lookupCache[$cacheKey] = '';

                return '';
            }
            $dbValue = $connection->fetchOne(
                $connection->select()
                    ->from($tableName, [$column])
                    ->where($idColumn . ' = ?', $entityId)
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
    private function applyToCart(
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

    /**
     * @param mixed $extensionAttributes
     * @param array $config
     */
    private function applyToAddress(
        object $shippingAddress,
        $extensionAttributes,
        array $config,
        string $column,
        string $value
    ): void {
        $setter = (string)($config['extension_setter'] ?? '');
        if (
            $extensionAttributes === null &&
            method_exists($shippingAddress, 'getExtensionAttributes') &&
            method_exists($shippingAddress, 'setExtensionAttributes')
        ) {
            // Address extension factory is not injected; only setData if no EA object.
            $extensionAttributes = $shippingAddress->getExtensionAttributes();
        }
        if (
            $extensionAttributes !== null &&
            $setter !== '' &&
            method_exists($extensionAttributes, $setter) &&
            method_exists($shippingAddress, 'setExtensionAttributes')
        ) {
            $extensionAttributes->{$setter}($value);
            $shippingAddress->setExtensionAttributes($extensionAttributes);
        }
        if (method_exists($shippingAddress, 'setData')) {
            $shippingAddress->setData($column, $value);
        }
    }

    public static function resetLookupCache(): void
    {
        self::$lookupCache = [];
    }
}
