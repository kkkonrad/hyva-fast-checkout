<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Customer\Model\Address;

use Magento\Customer\Model\Address\AbstractAddress as ParentClass;
use Magento\Directory\Helper\Data as DirectoryHelper;
use Magento\Framework\Phrase;
use Psr\Log\LoggerInterface;

class AbstractAddress
{
    /**
     * @var DirectoryHelper
     */
    private $directoryData;

    /**
     * @var LoggerInterface|null
     */
    private $logger;

    public function __construct(
        DirectoryHelper $directoryData,
        ?LoggerInterface $logger = null
    ) {
        $this->directoryData = $directoryData;
        $this->logger = $logger;
    }

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
                if ($this->logger) {
                    $this->logger->info('Fastcheckout address validation bypassed for non-required region', [
                        'country_id' => $countryId,
                        'region_id' => $regionId,
                    ]);
                }
                return true;
            }
        } catch (\Exception $e) {
            if ($this->logger) {
                $this->logger->warning('Fastcheckout address validation plugin failed', ['exception' => $e]);
            }
            return $result;
        }

        return $result;
    }
}
