<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Model\Config\Backend;

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
use Magento\Framework\Serialize\Serializer\Json as JsonSerializer;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class JsonTest extends TestCase
{
    public function testLoadsAndCleansFieldArrayRows(): void
    {
        $backend = $this->backend(
            '{"_1":{"shipping_method":"flatrate_flatrate","payment_method":"checkmo"}}'
        );
        $backend->afterLoad();
        self::assertSame([
            '_1' => ['shipping_method' => 'flatrate_flatrate', 'payment_method' => 'checkmo'],
        ], $backend->getValue());

        $backend->setValue([
            '__empty' => ['shipping_method' => '', 'payment_method' => ''],
            '_1' => ['shipping_method' => ' customcarrier_* ', 'payment_method' => ' payu_blik '],
        ])->beforeSave();
        self::assertSame([
            '_1' => ['shipping_method' => 'customcarrier_*', 'payment_method' => 'payu_blik'],
        ], json_decode((string)$backend->getValue(), true));
    }

    public function testRejectsPaymentWildcards(): void
    {
        $backend = $this->backend([
            '_1' => ['shipping_method' => 'customcarrier_*', 'payment_method' => 'payu_*'],
        ]);

        $this->expectException(LocalizedException::class);
        $backend->beforeSave();
    }

    private function backend($value): Json
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
            $this->createMock(TypeListInterface::class),
            null,
            null,
            [],
            new JsonSerializer()
        );
        $backend->setValue($value);

        return $backend;
    }
}
