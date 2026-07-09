<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Model\Config\Backend;

use Kkkonrad\Fastcheckout\Helper\Data as ConfigPaths;
use Kkkonrad\Fastcheckout\Model\Config\Backend\Json;
use Magento\Framework\App\Cache\TypeListInterface;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\State;
use Magento\Framework\Event\ManagerInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Model\ActionValidator\RemoveAction;
use Magento\Framework\Model\Context;
use Magento\Framework\Registry;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class JsonTest extends TestCase
{
    public function testBeforeSaveAcceptsExactRestrictedPaymentMethods(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_RESTRICT_PAYMENT_METHODS,
            '["checkmo","payu_blik"]'
        );

        $this->assertSame($backend, $backend->beforeSave());
        $this->assertSame('["checkmo","payu_blik"]', $backend->getValue());
    }

    public function testBeforeSaveRejectsRestrictedPaymentWildcard(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_RESTRICT_PAYMENT_METHODS,
            '["checkmo","payu_*"]'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Payment methods must use exact method codes.');

        $backend->beforeSave();
    }

    public function testBeforeSaveAcceptsShippingWildcardWithExactPaymentMethod(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_SHIPPING_PAYMENT_MAPPING,
            [
                '_1' => [
                    'shipping_method' => 'customcarrier_*',
                    'payment_method' => 'payu_blik',
                ],
            ]
        );

        $backend->beforeSave();

        $decoded = json_decode((string)$backend->getValue(), true);
        $this->assertSame('customcarrier_*', $decoded['_1']['shipping_method']);
        $this->assertSame('payu_blik', $decoded['_1']['payment_method']);
    }

    public function testBeforeSaveRemovesEmptyShippingPaymentMappingRowsFromFieldArrayPayload(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_SHIPPING_PAYMENT_MAPPING,
            [
                '__empty' => [
                    'shipping_method' => '',
                    'payment_method' => '',
                ],
                '_1' => [
                    'shipping_method' => ' customcarrier_* ',
                    'payment_method' => ' payu_blik ',
                ],
                '_2' => [
                    'shipping_method' => 'flatrate_flatrate',
                    'payment_method' => '',
                ],
            ]
        );

        $backend->beforeSave();

        $decoded = json_decode((string)$backend->getValue(), true);
        $this->assertSame([
            '_1' => [
                'shipping_method' => 'customcarrier_*',
                'payment_method' => 'payu_blik',
            ],
        ], $decoded);
    }

    public function testBeforeSaveRejectsPaymentWildcardInShippingPaymentMapping(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_SHIPPING_PAYMENT_MAPPING,
            [
                '_1' => [
                    'shipping_method' => 'customcarrier_*',
                    'payment_method' => 'payu_*',
                ],
            ]
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Payment methods must use exact method codes.');

        $backend->beforeSave();
    }

    public function testBeforeSaveAcceptsRequiredPaymentFields(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS,
            '{"purchaseorder":["po_number"],"custom_gateway":["additional_data.transaction_id"]}'
        );

        $this->assertSame($backend, $backend->beforeSave());
        $this->assertSame(
            '{"purchaseorder":["po_number"],"custom_gateway":["additional_data.transaction_id"]}',
            $backend->getValue()
        );
    }

    public function testBeforeSaveNormalizesRequiredPaymentFieldKeysAndPaths(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS,
            '{" custom_gateway ":[" additional_data.transaction_id "]}'
        );

        $backend->beforeSave();

        $this->assertSame('{"custom_gateway":["additional_data.transaction_id"]}', $backend->getValue());
    }

    public function testBeforeSaveRejectsWildcardRequiredPaymentMethod(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS,
            '{"payu_*":["additional_data.transaction_id"]}'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Payment methods must use exact method codes.');

        $backend->beforeSave();
    }

    public function testBeforeSaveRejectsInvalidRequiredPaymentFieldPath(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_PAYMENT_FIELDS,
            '{"custom_gateway":["additional_data.*"]}'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Required field paths must be exact field paths.');

        $backend->beforeSave();
    }

    public function testBeforeSaveAcceptsRequiredShippingFieldsWithShippingWildcard(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_SHIPPING_FIELDS,
            '{"customcarrier_*":["custom_attributes.pickup_location_code"],"*":["extension_attributes.delivery_note"]}'
        );

        $this->assertSame($backend, $backend->beforeSave());
        $this->assertSame(
            '{"customcarrier_*":["custom_attributes.pickup_location_code"],"*":["extension_attributes.delivery_note"]}',
            $backend->getValue()
        );
    }

    public function testBeforeSaveRejectsInvalidRequiredShippingWildcardPlacement(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_SHIPPING_FIELDS,
            '{"custom*carrier":["custom_attributes.pickup_location_code"]}'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Shipping method wildcards are supported only at the end of a rule.');

        $backend->beforeSave();
    }

    public function testBeforeSaveRejectsInvalidRequiredShippingFieldPath(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_REQUIRED_SHIPPING_FIELDS,
            '{"customcarrier_*":["custom_attributes.*"]}'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Required field paths must be exact field paths.');

        $backend->beforeSave();
    }

    public function testBeforeSaveRejectsInvalidJson(): void
    {
        $backend = $this->createBackend(
            ConfigPaths::XML_PATH_RESTRICT_PAYMENT_METHODS,
            '{invalid json'
        );

        $this->expectException(LocalizedException::class);
        $this->expectExceptionMessage('Invalid JSON provided for Fastcheckout configuration.');

        $backend->beforeSave();
    }

    /**
     * @param mixed $value
     */
    private function createBackend(string $path, $value): Json
    {
        $context = new Context(
            $this->createMock(LoggerInterface::class),
            $this->createMock(ManagerInterface::class),
            $this->createMock(CacheInterface::class),
            $this->createMock(State::class),
            $this->createMock(RemoveAction::class)
        );

        $backend = new Json(
            $context,
            $this->createMock(Registry::class),
            $this->createMock(ScopeConfigInterface::class),
            $this->createMock(TypeListInterface::class)
        );

        $backend->setPath($path);
        $backend->setValue($value);

        return $backend;
    }
}
