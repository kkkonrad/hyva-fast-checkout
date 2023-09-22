<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */

namespace IWD\Opc\Plugin\Customer\Model\Address;

use Magento\Customer\Model\Address\AbstractAddress as ParentClass;
use Magento\Framework\Phrase;

/**
 * Class AbstractAddress
 * @package IWD\Opc\Plugin\Customer\Model\Address
 */
class AbstractAddress
{
    /**
     * @var \Magento\Directory\Helper\Data
     */
    private $directoryData;

    /**
     * AbstractAddress constructor.
     * @param \Magento\Directory\Helper\Data $directoryData
     */
    public function __construct(\Magento\Directory\Helper\Data $directoryData)
    {
        $this->directoryData = $directoryData;
    }

    /**
     * Fix validation when region not required
     * @param ParentClass $subject
     * @param $result
     * @return bool
     */
    public function afterValidate(ParentClass $subject, $result)
    {
        //If only 1 mistake with regionId field
        if (is_array($result) && count($result) == 1 && $result[0] instanceof Phrase && $result[0]->getArguments()) {
            $arguments = $result[0]->getArguments();
            $countryId = $subject->getCountryId();
            if (empty($arguments['fieldName']) || $arguments['fieldName'] != 'regionId' || empty($countryId)) {
                return $result;
            }
            $isRegionRequired = $this->directoryData->isRegionRequired($countryId);
            $countryModel = $subject->getCountryModel();
            $regionCollection = $countryModel->getRegionCollection();
            $regionId = (string)$subject->getRegionId();
            $allowedRegions = $regionCollection->getAllIds();
            //If region not required && regionId exists
            if (!$isRegionRequired && $regionId && !in_array($regionId, $allowedRegions, true)) {
                return true;
            }
        }

        return $result;
    }
}
