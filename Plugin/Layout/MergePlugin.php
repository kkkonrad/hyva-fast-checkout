<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Layout;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\View\Model\Layout\Merge;
use SimpleXMLElement;
use DOMElement;

class MergePlugin
{
    private const FASTCHECKOUT_ACTION = 'fastcheckout_index_index';

    private HttpRequest $request;

    public function __construct(HttpRequest $request)
    {
        $this->request = $request;
    }

    /**
     * Fix referenceContainer name="head.additional" and referenceContainer name="before.body.end"
     * to referenceBlock for Hyva Compatibility without modifying vendor files.
     *
     * @param Merge $subject
     * @param SimpleXMLElement $xml
     * @return SimpleXMLElement
     */
    public function afterAsSimplexml(Merge $subject, SimpleXMLElement $xml): SimpleXMLElement
    {
        if ($this->request->getFullActionName() !== self::FASTCHECKOUT_ACTION) {
            return $xml;
        }

        $containers = $xml->xpath('//referenceContainer[@name="head.additional" or @name="before.body.end"]');
        if (empty($containers)) {
            return $xml;
        }

        foreach ($containers as $node) {
            $domNode = dom_import_simplexml($node);
            if ($domNode instanceof DOMElement && $domNode->parentNode) {
                $newNode = $domNode->ownerDocument->createElement('referenceBlock');
                foreach ($domNode->attributes as $attr) {
                    $newNode->setAttribute($attr->nodeName, $attr->nodeValue);
                }
                while ($domNode->firstChild) {
                    $newNode->appendChild($domNode->firstChild);
                }
                $domNode->parentNode->replaceChild($newNode, $domNode);
            }
        }

        return $xml;
    }
}
