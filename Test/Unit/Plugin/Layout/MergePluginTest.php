<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Layout;

use Kkkonrad\Fastcheckout\Plugin\Layout\MergePlugin;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\View\Model\Layout\Merge;
use PHPUnit\Framework\TestCase;
use SimpleXMLElement;

class MergePluginTest extends TestCase
{
    public function testConvertsPayuCompatibilityNodesOnFastcheckout(): void
    {
        $request = $this->createMock(HttpRequest::class);
        $request->method('getFullActionName')->willReturn('fastcheckout_index_index');
        $xml = new SimpleXMLElement(
            '<layout><referenceContainer name="head.additional"><block name="payu"/></referenceContainer>' .
            '<referenceContainer name="before.body.end"><block name="payu.script"/></referenceContainer></layout>'
        );

        (new MergePlugin($request))->afterAsSimplexml($this->createMock(Merge::class), $xml);

        self::assertCount(2, $xml->xpath('//referenceBlock'));
        self::assertSame('payu', (string)$xml->referenceBlock[0]->block['name']);
        self::assertSame('payu.script', (string)$xml->referenceBlock[1]->block['name']);
    }

    public function testLeavesOtherFrontendPagesUntouched(): void
    {
        $request = $this->createMock(HttpRequest::class);
        $request->method('getFullActionName')->willReturn('catalog_product_view');
        $xml = new SimpleXMLElement(
            '<layout><referenceContainer name="before.body.end"><block name="product.script"/></referenceContainer></layout>'
        );

        (new MergePlugin($request))->afterAsSimplexml($this->createMock(Merge::class), $xml);

        self::assertCount(1, $xml->xpath('//referenceContainer'));
        self::assertCount(0, $xml->xpath('//referenceBlock'));
    }
}
