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
