<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Checkout\Controller\Onepage;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage\Success;
use Magento\Checkout\Controller\Onepage\Success as SuccessController;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Framework\View\Result\Page;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SuccessTest extends TestCase
{
    /** @var RequestInterface&MockObject */
    private $request;

    /** @var RedirectFactory&MockObject */
    private $redirectFactory;

    /** @var CheckoutSession&MockObject */
    private $checkoutSession;

    /** @var Helper&MockObject */
    private $helper;

    protected function setUp(): void
    {
        $this->request = $this->getMockBuilder(RequestInterface::class)
            ->disableOriginalConstructor()
            ->getMock();
        $this->redirectFactory = $this->createMock(RedirectFactory::class);
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods(['setErrorMessage'])
            ->getMock();
        $this->helper = $this->createMock(Helper::class);
    }

    public function testDisabledModuleLeavesTheNativeSuccessPageUntouched(): void
    {
        $this->helper->method('isEnable')->willReturn(false);
        $this->request->expects($this->never())->method('getParam');

        $page = $this->createMock(Page::class);
        $this->assertSame($page, $this->plugin()->aroundExecute(
            $this->controller(),
            static function () use ($page) {
                return $page;
            }
        ));
    }

    public function testGatewayErrorCodeRedirectsToFailurePage(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getParam')->with('error')->willReturn('501');
        $this->checkoutSession->expects($this->once())->method('setErrorMessage');

        $redirect = $this->createMock(Redirect::class);
        $redirect->expects($this->once())
            ->method('setPath')
            ->with('checkout/onepage/failure')
            ->willReturnSelf();
        $this->redirectFactory->method('create')->willReturn($redirect);

        $this->assertSame($redirect, $this->plugin()->aroundExecute(
            $this->controller(),
            static function (): void {
                throw new \LogicException('The native success action must not run.');
            }
        ));
    }

    /**
     * Anyone can append ?error=... to the success URL. Only gateway status codes
     * may throw the shopper off the confirmation page.
     */
    public function testNonNumericErrorParamKeepsTheSuccessPage(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getParam')->with('error')->willReturn('haxx');
        $this->checkoutSession->expects($this->never())->method('setErrorMessage');

        $page = $this->createMock(Page::class);
        $this->assertSame($page, $this->plugin()->aroundExecute(
            $this->controller(),
            static function () use ($page) {
                return $page;
            }
        ));
    }

    public function testEnabledModuleKeepsTheNativeSuccessResult(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getParam')->with('error')->willReturn(null);

        $page = $this->createMock(Page::class);
        $this->assertSame($page, $this->plugin()->aroundExecute(
            $this->controller(),
            static function () use ($page) {
                return $page;
            }
        ));
    }

    private function plugin(): Success
    {
        return new Success(
            $this->request,
            $this->redirectFactory,
            $this->checkoutSession,
            $this->helper
        );
    }

    /**
     * @return SuccessController&MockObject
     */
    private function controller()
    {
        return $this->getMockBuilder(SuccessController::class)
            ->disableOriginalConstructor()
            ->getMock();
    }
}
