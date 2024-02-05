<?php

namespace IWD\Opc\Helper;

use Magento\Store\Model\ScopeInterface;

class GoogleAnalitics extends Data
{
    //GA
    const XML_PATH_GA4_ACTIVE = 'google/analytics/active';
    const XML_PATH_GA4_TRACKING_ID = 'google/analytics/account';

    public function isGa4Active()
    {
        $isActive = (bool)$this->scopeConfig->getValue(self::XML_PATH_GA4_ACTIVE, ScopeInterface::SCOPE_STORE);
        return !empty($isActive) ? $isActive : 0;
    }

    public function getGa4TrackingId()
    {
        return $this->scopeConfig->getValue(self::XML_PATH_GA4_TRACKING_ID, ScopeInterface::SCOPE_STORE);
    }
}
