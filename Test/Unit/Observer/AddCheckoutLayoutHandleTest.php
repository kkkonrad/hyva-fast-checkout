<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Observer\AddCheckoutLayoutHandle;
use Magento\Framework\Event\Observer;
use Magento\Framework\View\Layout\ProcessorInterface;
use Magento\Framework\View\LayoutInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class AddCheckoutLayoutHandleTest extends TestCase
{
    #[DataProvider('handleProvider')]
    public function testAddsFastcheckoutHandleBeforeLayoutLoad(string $action, string $handle): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(true);
        $update = $this->createMock(ProcessorInterface::class);
        $update->expects(self::once())->method('addHandle')->with($handle);
        $layout = $this->createMock(LayoutInterface::class);
        $layout->method('getUpdate')->willReturn($update);

        (new AddCheckoutLayoutHandle($helper))->execute(new Observer([
            'layout' => $layout,
            'full_action_name' => $action,
        ]));
    }

    public static function handleProvider(): array
    {
        return [
            ['checkout_index_index', 'fastcheckout_index_index'],
            ['checkout_onepage_success', 'fastcheckout_checkout_onepage_success'],
        ];
    }
}
