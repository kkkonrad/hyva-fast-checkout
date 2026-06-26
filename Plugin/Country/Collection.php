<?php

namespace Kkkonrad\Fastcheckout\Plugin\Country;

use Kkkonrad\Fastcheckout\Helper\Data as OpcHelper;
use Magento\Directory\Model\ResourceModel\Country\Collection as CountryCollection;

class Collection
{
    public $opcHelper;

    public function __construct(
        OpcHelper $opcHelper
    ) {
        $this->opcHelper = $opcHelper;
    }

    public function beforeToOptionArray(CountryCollection $subject, $emptyLabel = ' ')
    {
        return [$emptyLabel];
    }
}
