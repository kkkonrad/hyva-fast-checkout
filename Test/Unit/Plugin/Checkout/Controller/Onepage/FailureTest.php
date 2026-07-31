<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Checkout\Controller\Onepage;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage\Failure;
use Magento\Checkout\Controller\Onepage\Failure as FailureController;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Result\Page;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FailureTest extends TestCase
{
    public function testDisabledModuleDoesNotRestoreTheQuote(): void
    {
        $checkoutSession = $this->session();
        $checkoutSession->expects($this->never())->method('restoreQuote');

        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(false);

        $page = $this->createMock(Page::class);
        $page->expects($this->never())->method('addHandle');

        $plugin = new Failure($checkoutSession, $helper);
        $this->assertSame($page, $plugin->aroundExecute(
            $this->controller(),
            static function () use ($page) {
                return $page;
            }
        ));
    }

    public function testEnabledModuleRestoresQuoteAndAppliesItsOwnLayoutHandle(): void
    {
        $checkoutSession = $this->session();
        $checkoutSession->expects($this->once())->method('restoreQuote');

        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);

        $page = $this->createMock(Page::class);
        $page->expects($this->once())
            ->method('addHandle')
            ->with('fastcheckout_checkout_onepage_failure');

        $plugin = new Failure($checkoutSession, $helper);
        $plugin->aroundExecute(
            $this->controller(),
            static function () use ($page) {
                return $page;
            }
        );
    }

    /**
     * @return CheckoutSession&MockObject
     */
    private function session()
    {
        return $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['restoreQuote'])
            ->getMock();
    }

    /**
     * @return FailureController&MockObject
     */
    private function controller()
    {
        return $this->getMockBuilder(FailureController::class)
            ->disableOriginalConstructor()
            ->getMock();
    }
}
