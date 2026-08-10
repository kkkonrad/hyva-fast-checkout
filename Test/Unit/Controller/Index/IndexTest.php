<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Controller\Index;

use Kkkonrad\Fastcheckout\Controller\Index\Index;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;
use PHPUnit\Framework\TestCase;

class IndexTest extends TestCase
{
    public function testLegacyRouteRedirectsToNativeCheckout(): void
    {
        $redirect = $this->createMock(Redirect::class);
        $redirect->expects(self::once())->method('setPath')->with('checkout')->willReturnSelf();
        $factory = $this->createMock(RedirectFactory::class);
        $factory->expects(self::once())->method('create')->willReturn($redirect);

        self::assertSame($redirect, (new Index($factory))->execute());
    }
}
