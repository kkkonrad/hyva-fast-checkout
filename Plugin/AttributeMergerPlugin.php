<?php

namespace IWD\Opc\Plugin;

class AttributeMergerPlugin
{

    public function afterMerge(\Magento\Checkout\Block\Checkout\AttributeMerger $subject, $result)
    {
        return $result;
    }
}