<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model;

use Hyva\ThemeFallback\Model\ThemeSwitch;
use Magento\Checkout\Block\Onepage;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\Page\Layout\ReaderFactory as PageLayoutReaderFactory;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Builds Magento's real checkout layout without switching the storefront page away from Hyvä.
 */
class CheckoutLayoutCollector
{
    private ?LayoutFactory $layoutFactory;
    private ?DesignInterface $design;
    private ?ThemeSwitch $themeSwitch;
    private ?LoggerInterface $logger;
    private ?PageLayoutReaderFactory $pageLayoutReaderFactory;
    private ?array $collected = null;

    /**
     * Legacy optional arguments stay in place for constructor compatibility with 7.0.x.
     */
    public function __construct(
        ?LayoutFactory $layoutFactory = null,
        ?ModuleListInterface $moduleList = null,
        ?ComponentRegistrarInterface $componentRegistrar = null,
        ?SerializerInterface $serializer = null,
        ?CacheInterface $cache = null,
        ?StoreManagerInterface $storeManager = null,
        ?DesignInterface $design = null,
        ?LoggerInterface $logger = null,
        ?string $localeCode = null,
        ?ThemeSwitch $themeSwitch = null,
        ?PageLayoutReaderFactory $pageLayoutReaderFactory = null
    ) {
        $this->layoutFactory = $layoutFactory;
        $this->design = $design;
        $this->themeSwitch = $themeSwitch;
        $this->logger = $logger;
        $this->pageLayoutReaderFactory = $pageLayoutReaderFactory;
    }

    /**
     * @return array{jsLayout: array, assets: array{css: array, scripts: array}, source: string}
     */
    public function collect(): array
    {
        if ($this->collected !== null) {
            return $this->collected;
        }

        $result = [
            'jsLayout' => [],
            'assets' => ['css' => [], 'scripts' => []],
            'source' => 'magento-layout'
        ];

        if ($this->layoutFactory === null || $this->design === null || $this->themeSwitch === null ||
            $this->pageLayoutReaderFactory === null) {
            return $this->collected = $result;
        }

        $originalTheme = $this->design->getDesignTheme();

        try {
            $this->themeSwitch->switchToFallback();
            $layout = $this->layoutFactory->create(['cacheable' => false]);
            $update = $layout->getUpdate();
            $update->addHandle('checkout_index_index');
            // checkout.root targets `content`, normally declared by the global
            // default handle. Recreate only that parent to avoid preparing global
            // RequireJS blocks inside this isolated fallback-theme layout.
            $update->addUpdate(
                '<referenceContainer name="main"><container name="content"/></referenceContainer>'
            );
            $update->load();
            $layout->generateXml();
            $pageLayout = $update->getPageLayout() ?: 'checkout';
            $this->pageLayoutReaderFactory->create()->read($layout->getReaderContext(), $pageLayout);
            $layout->generateElements();

            $checkoutRoot = $layout->getBlock('checkout.root');
            if ($checkoutRoot instanceof Onepage) {
                $jsLayout = $checkoutRoot->getData('jsLayout');
                $result['jsLayout'] = is_array($jsLayout) ? $jsLayout : [];
            }
        } catch (\Throwable $exception) {
            $result['source'] = 'magento-layout-failed';
            if ($this->logger !== null) {
                $this->logger->error('Fastcheckout could not build the native checkout layout.', [
                    'exception' => $exception
                ]);
            }
        } finally {
            $this->design->setDesignTheme($originalTheme);
        }

        return $this->collected = $result;
    }
}
