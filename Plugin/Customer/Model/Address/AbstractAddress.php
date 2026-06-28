<?php
namespace Kkkonrad\Fastcheckout\Plugin\Customer\Model\Address;

use Magento\Customer\Model\Address\AbstractAddress as ParentClass;
use Magento\Framework\Phrase;

/**
 * Class AbstractAddress
 * @package Kkkonrad\Fastcheckout\Plugin\Customer\Model\Address
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
        if (!is_array($result) || count($result) !== 1) {
            return $result;
        }

        $firstError = $result[0] ?? null;
        if (!$firstError instanceof Phrase || !$firstError->getArguments()) {
            return $result;
        }

        $arguments = $firstError->getArguments();
        $countryId = (string)$subject->getCountryId();
        if (empty($arguments['fieldName']) || $arguments['fieldName'] !== 'regionId' || $countryId === '') {
            return $result;
        }

        try {
            $isRegionRequired = $this->directoryData->isRegionRequired($countryId);
            $countryModel = $subject->getCountryModel();
            if (!$countryModel || !method_exists($countryModel, 'getRegionCollection')) {
                return $result;
            }

            $regionCollection = $countryModel->getRegionCollection();
            if (!$regionCollection || !method_exists($regionCollection, 'getAllIds')) {
                return $result;
            }

            $regionId = (string)$subject->getRegionId();
            $allowedRegions = $regionCollection->getAllIds();

            if (!$isRegionRequired && $regionId !== '' && !in_array($regionId, $allowedRegions, true)) {
                return true;
            }
        } catch (\Exception $e) {
            return $result;
        }

        return $result;
    }
}
