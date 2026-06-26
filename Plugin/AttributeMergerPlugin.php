<?php

namespace Kkkonrad\Fastcheckout\Plugin;

class AttributeMergerPlugin
{

    public function afterMerge(\Magento\Checkout\Block\Checkout\AttributeMerger $subject, $result)
    {
        return $result;
    }
}