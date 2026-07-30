<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Quote\PlaceOrderExtrasPlugin;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Quote\Api\CartManagementInterface;
use Magento\Quote\Api\Data\PaymentInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PlaceOrderExtrasPluginTest extends TestCase
{
    /** @var CheckoutSession|MockObject */
    private $checkoutSession;

    /** @var Helper|MockObject */
    private $helper;

    /** @var HttpRequest|MockObject */
    private $request;

    /** @var PlaceOrderExtrasPlugin */
    private $plugin;

    protected function setUp(): void
    {
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods([
                'setFastcheckoutComment',
                'unsFastcheckoutComment',
                'setFastcheckoutSubscribe',
                'unsFastcheckoutSubscribe',
            ])
            ->getMock();
        $this->helper = $this->createMock(Helper::class);
        $this->request = $this->getMockBuilder(HttpRequest::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getContent'])
            ->getMock();
        $this->plugin = new PlaceOrderExtrasPlugin(
            $this->checkoutSession,
            $this->helper,
            $this->request
        );
    }

    public function testBeforePlaceOrderStoresCommentFromPaymentAdditionalData(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getContent')->willReturn('');

        $payment = $this->createMock(PaymentInterface::class);
        $payment->method('getAdditionalData')->willReturn([
            'fastcheckout_comment' => ' Leave at door ',
        ]);
        $payment->method('getExtensionAttributes')->willReturn(null);

        $this->checkoutSession->expects($this->once())
            ->method('setFastcheckoutComment')
            ->with('Leave at door');

        $subject = $this->createMock(CartManagementInterface::class);
        $result = $this->plugin->beforePlaceOrder($subject, 42, $payment);

        $this->assertSame([42, $payment], $result);
    }

    public function testBeforePlaceOrderReadsCommentFromJsonBody(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getContent')->willReturn(json_encode([
            'paymentMethod' => [
                'method' => 'checkmo',
                'extension_attributes' => [
                    // Registered PaymentInterface extension attributes
                    'comment' => 'Gift wrap please',
                    'subscribe' => 1,
                ],
            ],
        ]));

        $this->checkoutSession->expects($this->once())
            ->method('setFastcheckoutComment')
            ->with('Gift wrap please');
        $this->checkoutSession->expects($this->once())
            ->method('setFastcheckoutSubscribe')
            ->with(1);

        $subject = $this->createMock(CartManagementInterface::class);
        $this->plugin->beforePlaceOrder($subject, 7, null);
    }

    public function testBeforePlaceOrderReadsLegacyFastcheckoutKeysFromJsonBody(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getContent')->willReturn(json_encode([
            'paymentMethod' => [
                'method' => 'checkmo',
                'additional_data' => [
                    'fastcheckout_comment' => 'Legacy bag',
                    'fastcheckout_subscribe' => '1',
                ],
            ],
        ]));

        $this->checkoutSession->expects($this->once())
            ->method('setFastcheckoutComment')
            ->with('Legacy bag');
        $this->checkoutSession->expects($this->once())
            ->method('setFastcheckoutSubscribe')
            ->with(1);

        $subject = $this->createMock(CartManagementInterface::class);
        $this->plugin->beforePlaceOrder($subject, 7, null);
    }

    public function testBeforePlaceOrderClearsExtrasMissingFromCurrentRequest(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $this->request->method('getContent')->willReturn('');
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutComment');
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutSubscribe');

        $subject = $this->createMock(CartManagementInterface::class);
        $this->plugin->beforePlaceOrder($subject, 7, null);
    }

    public function testBeforePlaceOrderNoopWhenModuleDisabled(): void
    {
        $this->helper->method('isEnable')->willReturn(false);
        $this->checkoutSession->expects($this->never())->method('setFastcheckoutComment');
        $this->checkoutSession->expects($this->never())->method('unsFastcheckoutComment');

        $subject = $this->createMock(CartManagementInterface::class);
        $result = $this->plugin->beforePlaceOrder($subject, 1, null);
        $this->assertSame([1, null], $result);
    }
}
