<?php

namespace Kkkonrad\Fastcheckout\Plugin\Country;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Directory\Model\ResourceModel\Country\Collection as CountryCollection;

class Collection
{
    public $helper;

    public function __construct(
        Helper $helper
    ) {
        $this->helper = $helper;
    }

    public function beforeToOptionArray(CountryCollection $subject, $emptyLabel = ' ')
    {
        return [$emptyLabel];
    }
}
