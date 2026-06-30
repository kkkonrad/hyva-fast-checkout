<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model\Hyva;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\App\View\Asset\Publisher;
use Magento\Framework\Filesystem;
use Magento\Framework\RequireJs\Config as RequireJsConfig;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\RequireJs\Model\FileManager;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

class RequireJsAssets
{
    public const XML_PATH_AUTO_GENERATE = 'fastcheckout/hyva/auto_generate_requirejs_assets';

    private const REQUIRED_CONFIG_MARKERS = [
        'Kkkonrad_Fastcheckout/js/mixin/storage-mixin',
        'Kkkonrad_Fastcheckout/js/mixin/set-shipping-information-mixin',
        'Kkkonrad_Fastcheckout/js/mixin/set-payment-information-mixin',
        'Kkkonrad_Fastcheckout/js/mixin/set-billing-address-mixin',
        'Kkkonrad_Fastcheckout/js/mixin/place-order-mixin',
    ];

    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @var FileManager
     */
    private $fileManager;

    /**
     * @var Publisher
     */
    private $assetPublisher;

    /**
     * @var AssetRepository
     */
    private $assetRepository;

    /**
     * @var Filesystem
     */
    private $filesystem;

    /**
     * @var RequireJsConfig
     */
    private $requireJsConfig;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var bool
     */
    private $wasChecked = false;

    public function __construct(
        ScopeConfigInterface $scopeConfig,
        FileManager $fileManager,
        Publisher $assetPublisher,
        AssetRepository $assetRepository,
        Filesystem $filesystem,
        RequireJsConfig $requireJsConfig,
        LoggerInterface $logger
    ) {
        $this->scopeConfig = $scopeConfig;
        $this->fileManager = $fileManager;
        $this->assetPublisher = $assetPublisher;
        $this->assetRepository = $assetRepository;
        $this->filesystem = $filesystem;
        $this->requireJsConfig = $requireJsConfig;
        $this->logger = $logger;
    }

    /**
     * Ensure the two RequireJS files needed by the Hyva checkout bridge exist
     * for the current frontend theme and locale.
     *
     * @param int|string|null $storeId
     * @return bool
     */
    public function ensure($storeId = null): bool
    {
        if ($this->wasChecked || !$this->isEnabled($storeId)) {
            return false;
        }

        $this->wasChecked = true;

        try {
            $staticDir = $this->filesystem->getDirectoryWrite(DirectoryList::STATIC_VIEW);
            $generated = false;

            if (!$staticDir->isExist($this->requireJsConfig->getRequireJsFileRelativePath())) {
                $this->assetPublisher->publish($this->assetRepository->createAsset(RequireJsConfig::REQUIRE_JS_FILE_NAME));
                $generated = true;
            }

            if (!$this->isRequireJsConfigCurrent($staticDir)) {
                if ($staticDir->isExist($this->requireJsConfig->getConfigFileRelativePath())) {
                    $staticDir->delete($this->requireJsConfig->getConfigFileRelativePath());
                }
                $this->fileManager->createRequireJsConfigAsset();
                $generated = true;
            }

            return $generated;
        } catch (\Throwable $exception) {
            $this->logger->warning(
                'Kkkonrad Fastcheckout: could not generate RequireJS static assets.',
                ['exception' => $exception]
            );
        }

        return false;
    }

    private function isRequireJsConfigCurrent(\Magento\Framework\Filesystem\Directory\WriteInterface $staticDir): bool
    {
        $configPath = $this->requireJsConfig->getConfigFileRelativePath();

        if (!$staticDir->isExist($configPath)) {
            return false;
        }

        $content = (string)$staticDir->readFile($configPath);
        foreach (self::REQUIRED_CONFIG_MARKERS as $marker) {
            if (strpos($content, $marker) === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param int|string|null $storeId
     * @return bool
     */
    private function isEnabled($storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(
            self::XML_PATH_AUTO_GENERATE,
            ScopeInterface::SCOPE_STORE,
            $storeId
        );
    }
}
