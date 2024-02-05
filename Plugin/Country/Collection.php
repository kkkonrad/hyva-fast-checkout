<?php

namespace IWD\Opc\Plugin\Country;

use IWD\Opc\Helper\Data as OpcHelper;
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
