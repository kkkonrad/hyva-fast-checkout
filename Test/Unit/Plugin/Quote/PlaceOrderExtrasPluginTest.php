<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Quote\PlaceOrderExtrasPlugin;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Api\ExtensionAttributesInterface;
use Magento\Quote\Api\Data\PaymentInterface;
use Magento\Quote\Api\PaymentMethodManagementInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class PlaceOrderExtrasPluginTest extends TestCase
{
    /** @var CheckoutSession&MockObject */
    private $checkoutSession;
    /** @var Helper&MockObject */
    private $helper;
    private PlaceOrderExtrasPlugin $plugin;

    protected function setUp(): void
    {
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods([
                'setFastcheckoutComment',
                'unsFastcheckoutComment',
                'setFastcheckoutSubscribe',
                'unsFastcheckoutSubscribe',
                'setFastcheckoutQuoteId',
                'unsFastcheckoutQuoteId',
            ])
            ->getMock();
        $this->helper = $this->createMock(Helper::class);
        $this->plugin = new PlaceOrderExtrasPlugin($this->checkoutSession, $this->helper);
    }

    public function testStoresRegisteredPaymentExtensionAttributes(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $extensionAttributes = new class implements ExtensionAttributesInterface {
            public function getComment(): string
            {
                return ' Leave at reception ';
            }

            public function getSubscribe(): bool
            {
                return true;
            }
        };
        $payment = $this->createMock(PaymentInterface::class);
        $payment->method('getExtensionAttributes')->willReturn($extensionAttributes);

        $this->checkoutSession->expects(self::once())
            ->method('setFastcheckoutComment')->with('Leave at reception');
        $this->checkoutSession->expects(self::once())
            ->method('setFastcheckoutSubscribe')->with(1);
        $this->checkoutSession->expects(self::once())
            ->method('setFastcheckoutQuoteId')->with('42');

        $result = $this->plugin->beforeSet(
            $this->createMock(PaymentMethodManagementInterface::class),
            42,
            $payment
        );

        self::assertSame([42, $payment], $result);
    }

    public function testDoesNotReadPaymentMethodAdditionalData(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $extensionAttributes = new class implements ExtensionAttributesInterface {
            public function getComment(): ?string
            {
                return null;
            }

            public function getSubscribe(): ?bool
            {
                return null;
            }
        };
        $payment = $this->createMock(PaymentInterface::class);
        $payment->method('getExtensionAttributes')->willReturn($extensionAttributes);
        $payment->expects(self::never())->method('getAdditionalData');

        $this->checkoutSession->expects(self::never())->method('setFastcheckoutQuoteId');
        $this->checkoutSession->expects(self::never())->method('unsFastcheckoutComment');
        $this->checkoutSession->expects(self::never())->method('unsFastcheckoutSubscribe');

        $this->plugin->beforeSet(
            $this->createMock(PaymentMethodManagementInterface::class),
            7,
            $payment
        );
    }

    public function testStoresExplicitEmptyExtrasForTheMatchingQuote(): void
    {
        $this->helper->method('isEnable')->willReturn(true);
        $extensionAttributes = new class implements ExtensionAttributesInterface {
            public function getComment(): string
            {
                return ' ';
            }

            public function getSubscribe(): bool
            {
                return false;
            }
        };
        $payment = $this->createMock(PaymentInterface::class);
        $payment->method('getExtensionAttributes')->willReturn($extensionAttributes);

        $this->checkoutSession->expects(self::once())->method('setFastcheckoutQuoteId')->with('7');
        $this->checkoutSession->expects(self::once())->method('unsFastcheckoutComment');
        $this->checkoutSession->expects(self::once())->method('setFastcheckoutSubscribe')->with(0);

        $this->plugin->beforeSet(
            $this->createMock(PaymentMethodManagementInterface::class),
            7,
            $payment
        );
    }

    public function testDoesNothingWhenModuleIsDisabled(): void
    {
        $this->helper->method('isEnable')->willReturn(false);
        $payment = $this->createMock(PaymentInterface::class);
        $this->checkoutSession->expects(self::never())->method('setFastcheckoutComment');
        $this->checkoutSession->expects(self::never())->method('unsFastcheckoutComment');

        self::assertSame(
            [1, $payment],
            $this->plugin->beforeSet(
                $this->createMock(PaymentMethodManagementInterface::class),
                1,
                $payment
            )
        );
    }
}
