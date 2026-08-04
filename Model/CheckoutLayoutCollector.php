<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Model;

use Magento\Framework\App\Cache\Type\Config as ConfigCacheType;
use Magento\Framework\App\Cache\Type\Layout as LayoutCacheType;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\ObjectManager;
use Magento\Framework\Component\ComponentRegistrar;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\LayoutInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;
use SimpleXMLElement;

/**
 * Collect Magento checkout jsLayout + head assets for Fastcheckout.
 *
 * Primary path: Magento frontend layout merge for handle checkout_index_index
 * (modules + theme). Fallback: filesystem scan of module layout XML (unit tests
 * and environments where a nested layout build is unsafe).
 */
class CheckoutLayoutCollector
{
    private const CACHE_PREFIX = 'fastcheckout_raw_layout_';
    /** Bump when collection logic changes so stale empty caches are not reused. */
    private const CACHE_VERSION = 'v4-prefer-module-files';

    private ?LayoutFactory $layoutFactory;
    private ?ModuleListInterface $moduleList;
    private ?ComponentRegistrarInterface $componentRegistrar;
    private ?SerializerInterface $serializer;
    private ?CacheInterface $cache;
    private ?StoreManagerInterface $storeManager;
    private ?DesignInterface $design;
    private ?LoggerInterface $logger;
    private ?string $localeCode;

    public function __construct(
        ?LayoutFactory $layoutFactory = null,
        ?ModuleListInterface $moduleList = null,
        ?ComponentRegistrarInterface $componentRegistrar = null,
        ?SerializerInterface $serializer = null,
        ?CacheInterface $cache = null,
        ?StoreManagerInterface $storeManager = null,
        ?DesignInterface $design = null,
        ?LoggerInterface $logger = null,
        ?string $localeCode = null
    ) {
        // Magento often skips injecting parameters that have `= null` defaults.
        // Resolve critical services so web + CLI always scan module layout XML.
        $this->layoutFactory = $layoutFactory;
        $this->moduleList = $moduleList;
        $this->componentRegistrar = $componentRegistrar;
        $this->serializer = $serializer;
        $this->cache = $cache;
        $this->storeManager = $storeManager;
        $this->design = $design;
        $this->logger = $logger;
        $this->localeCode = $localeCode;

        if (
            $this->moduleList === null
            || $this->componentRegistrar === null
            || $this->layoutFactory === null
        ) {
            try {
                $om = ObjectManager::getInstance();
                $this->layoutFactory = $this->layoutFactory ?? $om->get(LayoutFactory::class);
                $this->moduleList = $this->moduleList ?? $om->get(ModuleListInterface::class);
                $this->componentRegistrar = $this->componentRegistrar
                    ?? $om->get(ComponentRegistrarInterface::class);
                $this->serializer = $this->serializer ?? $om->get(SerializerInterface::class);
                $this->cache = $this->cache ?? $om->get(CacheInterface::class);
                $this->storeManager = $this->storeManager ?? $om->get(StoreManagerInterface::class);
                $this->design = $this->design ?? $om->get(DesignInterface::class);
                $this->logger = $this->logger ?? $om->get(LoggerInterface::class);
            } catch (\Throwable $exception) {
                // Unit tests may construct without a Magento ObjectManager.
            }
        }
    }

    /**
     * @return array{jsLayout: array, assets: array{css: array, scripts: array}, source: string}
     */
    public function collect(): array
    {
        $empty = [
            'jsLayout' => [],
            'assets' => ['css' => [], 'scripts' => []],
            'source' => 'empty'
        ];

        $cacheId = $this->getCacheId();
        if ($this->cache !== null && $this->serializer !== null && $cacheId !== '') {
            try {
                $cached = $this->cache->load($cacheId);
                $cached = is_string($cached) && $cached !== ''
                    ? $this->serializer->unserialize($cached)
                    : null;
                // Never reuse an empty jsLayout cache (Hyvä theme removes checkout.root,
                // which previously cached an empty magento-layout forever).
                if (
                    is_array($cached) &&
                    is_array($cached['jsLayout'] ?? null) &&
                    $cached['jsLayout'] !== [] &&
                    $this->jsLayoutHasShippingFieldset($cached['jsLayout']) &&
                    is_array($cached['assets'] ?? null)
                ) {
                    $cached['source'] = (string)($cached['source'] ?? 'cache');
                    return $cached;
                }
            } catch (\Throwable $exception) {
                // rebuild
            }
        }

        // Prefer filesystem module merge: under Hyvä, theme checkout_index_index
        // replaces Magento checkout.root with a "No Checkout module" notice, so a
        // full LayoutFactory merge yields empty jsLayout. Module XML still has the
        // real OPC tree (same as Luma Magento_Checkout).
        $moduleResult = $this->collectViaModuleFiles();
        $magentoResult = $this->collectViaMagentoLayout();

        if ($this->jsLayoutHasShippingFieldset($moduleResult['jsLayout'] ?? [])) {
            $result = $moduleResult;
            $result['assets'] = $this->mergeAssets(
                $moduleResult['assets'] ?? ['css' => [], 'scripts' => []],
                $magentoResult['assets'] ?? ['css' => [], 'scripts' => []]
            );
            $result['source'] = 'module-files';
        } elseif ($this->jsLayoutHasShippingFieldset($magentoResult['jsLayout'] ?? [])) {
            $result = $magentoResult;
        } elseif (($moduleResult['jsLayout'] ?? []) !== []) {
            $result = $moduleResult;
        } elseif (($magentoResult['jsLayout'] ?? []) !== []) {
            $result = $magentoResult;
        } else {
            $result = $empty;
        }

        if ($result === []) {
            $result = $empty;
        }

        if (
            $this->cache !== null &&
            $this->serializer !== null &&
            $cacheId !== '' &&
            ($result['jsLayout'] ?? []) !== [] &&
            $this->jsLayoutHasShippingFieldset($result['jsLayout'])
        ) {
            try {
                $this->cache->save(
                    $this->serializer->serialize($result),
                    $cacheId,
                    [ConfigCacheType::CACHE_TAG, LayoutCacheType::CACHE_TAG]
                );
            } catch (\Throwable $exception) {
                // optional
            }
        }

        return $result;
    }

    /**
     * @param array $jsLayout
     */
    private function jsLayoutHasShippingFieldset(array $jsLayout): bool
    {
        $fieldset = $jsLayout['components']['checkout']['children']['steps']['children']
            ['shipping-step']['children']['shippingAddress']['children']
            ['shipping-address-fieldset']['children'] ?? null;

        return is_array($fieldset) && $fieldset !== [];
    }

    /**
     * @param array{css?: array, scripts?: array} $left
     * @param array{css?: array, scripts?: array} $right
     * @return array{css: array, scripts: array}
     */
    private function mergeAssets(array $left, array $right): array
    {
        $css = array_values(array_unique(
            array_merge($left['css'] ?? [], $right['css'] ?? []),
            SORT_REGULAR
        ));
        $scripts = array_values(array_unique(
            array_merge($left['scripts'] ?? [], $right['scripts'] ?? [])
        ));

        return ['css' => $css, 'scripts' => $scripts];
    }

    /**
     * Full Magento layout resolution for checkout_index_index (theme + modules).
     *
     * @return array{jsLayout: array, assets: array{css: array, scripts: array}, source: string}
     */
    public function collectViaMagentoLayout(): array
    {
        $result = [
            'jsLayout' => [],
            'assets' => ['css' => [], 'scripts' => []],
            'source' => 'magento-layout'
        ];

        if ($this->layoutFactory === null) {
            return $result;
        }

        try {
            /** @var LayoutInterface $layout */
            $layout = $this->layoutFactory->create(['cacheable' => false]);
            $update = $layout->getUpdate();
            $update->addHandle('default');
            $update->addHandle('checkout_index_index');
            $update->load();
            $layout->generateXml();
            $layout->generateElements();

            $checkoutRoot = $layout->getBlock('checkout.root');
            if ($checkoutRoot) {
                $jsLayout = $checkoutRoot->getData('jsLayout');
                if (is_array($jsLayout)) {
                    $result['jsLayout'] = $jsLayout;
                }
            }

            // Merged XML includes theme + module head assets for the OPC handle.
            $mergedXml = $update->asSimplexml();
            if ($mergedXml instanceof SimpleXMLElement) {
                $result['assets'] = $this->extractHeadAssetsFromXml($mergedXml);
            }
        } catch (\Throwable $exception) {
            if ($this->logger) {
                $this->logger->warning('Fastcheckout Magento layout merge failed; falling back to module files.', [
                    'exception' => $exception
                ]);
            }
            $result['source'] = 'magento-layout-failed';
        }

        return $result;
    }

    /**
     * Filesystem scan of module checkout_index_index.xml (legacy / unit-test path).
     *
     * @return array{jsLayout: array, assets: array{css: array, scripts: array}, source: string}
     */
    public function collectViaModuleFiles(): array
    {
        $result = [
            'jsLayout' => [],
            'assets' => ['css' => [], 'scripts' => []],
            'source' => 'module-files'
        ];

        if ($this->moduleList === null || $this->componentRegistrar === null) {
            return $result;
        }

        foreach ($this->moduleList->getNames() as $moduleName) {
            $modulePath = $this->componentRegistrar->getPath(ComponentRegistrar::MODULE, $moduleName);
            $layoutFile = $modulePath
                ? $modulePath . '/view/frontend/layout/checkout_index_index.xml'
                : '';
            if (!is_file($layoutFile)) {
                continue;
            }

            $dom = new \DOMDocument();
            $previous = libxml_use_internal_errors(true);
            try {
                if (!$dom->load($layoutFile)) {
                    continue;
                }

                $xpath = new \DOMXPath($dom);
                $arguments = $xpath->query(
                    '//*[(local-name()="block" or local-name()="referenceBlock") and @name="checkout.root"]' .
                    '/*[local-name()="arguments"]/*[local-name()="argument" and @name="jsLayout"]'
                );
                foreach ($arguments as $argument) {
                    if (!$argument instanceof \DOMElement) {
                        continue;
                    }
                    $layout = $this->parseJsLayoutItem($argument);
                    if (is_array($layout)) {
                        $result['jsLayout'] = $this->mergeJsLayoutArrays(
                            $result['jsLayout'],
                            $layout
                        );
                    }
                }

                if ($moduleName === 'Kkkonrad_Fastcheckout') {
                    continue;
                }
                foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="css"]') as $node) {
                    if (!$node instanceof \DOMElement) {
                        continue;
                    }
                    $src = $node->getAttribute('src');
                    if ($src !== '') {
                        $result['assets']['css'][] = [
                            'src' => $src,
                            'src_type' => $node->getAttribute('src_type') ?: null
                        ];
                    }
                }
                foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="script"]') as $node) {
                    if (!$node instanceof \DOMElement) {
                        continue;
                    }
                    $src = $node->getAttribute('src');
                    if ($src !== '') {
                        $result['assets']['scripts'][] = $src;
                    }
                }
            } catch (\Throwable $exception) {
                // skip malformed
            } finally {
                libxml_clear_errors();
                libxml_use_internal_errors($previous);
            }
        }

        // Theme layout files (app/design/.../checkout_index_index.xml)
        foreach ($this->collectThemeLayoutFiles() as $layoutFile) {
            $this->mergeLayoutFileIntoResult($layoutFile, $result);
        }

        $result['assets']['css'] = array_values(array_unique(
            $result['assets']['css'],
            SORT_REGULAR
        ));
        $result['assets']['scripts'] = array_values(array_unique(
            $result['assets']['scripts']
        ));

        return $result;
    }

    /**
     * @return string[]
     */
    private function collectThemeLayoutFiles(): array
    {
        $files = [];
        if ($this->design === null) {
            return $files;
        }

        try {
            $theme = $this->design->getDesignTheme();
            while ($theme) {
                $fullPath = method_exists($theme, 'getFullPath') ? (string)$theme->getFullPath() : '';
                // e.g. frontend/Hyva/default
                if ($fullPath !== '' && defined('BP')) {
                    $parts = explode('/', $fullPath);
                    if (count($parts) >= 3) {
                        $base = rtrim((string)BP, '/');
                        $candidate = $base . '/app/design/' . $fullPath .
                            '/Magento_Checkout/layout/checkout_index_index.xml';
                        if (is_file($candidate)) {
                            $files[] = $candidate;
                        }
                        // Theme may also host vendor module layout overrides:
                        $themeRoot = $base . '/app/design/' . $fullPath;
                        if (is_dir($themeRoot)) {
                            $iterator = new \RecursiveIteratorIterator(
                                new \RecursiveDirectoryIterator(
                                    $themeRoot,
                                    \FilesystemIterator::SKIP_DOTS
                                )
                            );
                            foreach ($iterator as $fileInfo) {
                                if (
                                    $fileInfo->isFile() &&
                                    $fileInfo->getFilename() === 'checkout_index_index.xml'
                                ) {
                                    $files[] = $fileInfo->getPathname();
                                }
                            }
                        }
                    }
                }
                $theme = $theme->getParentTheme();
            }
        } catch (\Throwable $exception) {
            // unit tests without design
        }

        return array_values(array_unique($files));
    }

    /**
     * @param string $layoutFile
     * @param array $result
     */
    private function mergeLayoutFileIntoResult(string $layoutFile, array &$result): void
    {
        $dom = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            if (!$dom->load($layoutFile)) {
                return;
            }
            $xpath = new \DOMXPath($dom);
            $arguments = $xpath->query(
                '//*[(local-name()="block" or local-name()="referenceBlock") and @name="checkout.root"]' .
                '/*[local-name()="arguments"]/*[local-name()="argument" and @name="jsLayout"]'
            );
            foreach ($arguments as $argument) {
                if (!$argument instanceof \DOMElement) {
                    continue;
                }
                $layout = $this->parseJsLayoutItem($argument);
                if (is_array($layout)) {
                    $result['jsLayout'] = $this->mergeJsLayoutArrays($result['jsLayout'], $layout);
                }
            }
            foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="css"]') as $node) {
                if (!$node instanceof \DOMElement) {
                    continue;
                }
                $src = $node->getAttribute('src');
                if ($src !== '') {
                    $result['assets']['css'][] = [
                        'src' => $src,
                        'src_type' => $node->getAttribute('src_type') ?: null
                    ];
                }
            }
            foreach ($xpath->query('//*[local-name()="head"]/*[local-name()="script"]') as $node) {
                if (!$node instanceof \DOMElement) {
                    continue;
                }
                $src = $node->getAttribute('src');
                if ($src !== '') {
                    $result['assets']['scripts'][] = $src;
                }
            }
        } catch (\Throwable $exception) {
            // skip
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    /**
     * @param SimpleXMLElement $xml
     * @return array{css: array, scripts: array}
     */
    private function extractHeadAssetsFromXml(SimpleXMLElement $xml): array
    {
        $assets = ['css' => [], 'scripts' => []];

        foreach ($xml->xpath('//head/css') ?: [] as $node) {
            $src = (string)($node['src'] ?? '');
            if ($src === '') {
                continue;
            }
            $assets['css'][] = [
                'src' => $src,
                'src_type' => isset($node['src_type']) ? (string)$node['src_type'] : null
            ];
        }
        foreach ($xml->xpath('//head/script') ?: [] as $node) {
            $src = (string)($node['src'] ?? '');
            if ($src !== '') {
                $assets['scripts'][] = $src;
            }
        }

        $assets['css'] = array_values(array_unique($assets['css'], SORT_REGULAR));
        $assets['scripts'] = array_values(array_unique($assets['scripts']));

        return $assets;
    }

    private function getCacheId(): string
    {
        $storeId = '';
        $themeId = '';
        try {
            if ($this->storeManager) {
                $storeId = (string)$this->storeManager->getStore()->getId();
            }
            if ($this->design) {
                $theme = $this->design->getDesignTheme();
                $themeId = $theme ? (string)($theme->getId() ?: $theme->getCode()) : '';
            }
        } catch (\Throwable $exception) {
            // ignore
        }

        $modules = $this->moduleList !== null ? implode(',', $this->moduleList->getNames()) : '';

        return self::CACHE_PREFIX . sha1(implode('|', [
            self::CACHE_VERSION,
            $storeId,
            $themeId,
            (string)$this->localeCode,
            $modules
        ]));
    }

    /**
     * @param \DOMElement $node
     * @return array|bool|float|int|string|null
     */
    public function parseJsLayoutItem(\DOMElement $node)
    {
        $type = $node->getAttribute('xsi:type');
        if (!$type && $node->hasAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')) {
            $type = $node->getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type');
        }

        if ($type === 'array') {
            $result = [];
            foreach ($node->childNodes as $child) {
                if (!$child instanceof \DOMElement || $child->localName !== 'item') {
                    continue;
                }

                $name = $child->getAttribute('name');
                if ($name === '') {
                    continue;
                }

                $result[$name] = $this->mergeJsLayoutArrays(
                    $result[$name] ?? [],
                    $this->parseJsLayoutItem($child)
                );
            }

            return $result;
        }

        $value = trim($node->textContent);
        if ($type === 'boolean') {
            return $value === 'true' || $value === '1';
        }
        if ($type === 'number') {
            return strpos($value, '.') === false ? (int)$value : (float)$value;
        }
        if ($value === '') {
            return null;
        }

        return $node->getAttribute('translate') === 'true' ? (string)__($value) : $value;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     * @return mixed
     */
    public function mergeJsLayoutArrays($left, $right)
    {
        if (!is_array($left) || !is_array($right)) {
            return $right;
        }

        foreach ($right as $key => $value) {
            if (array_key_exists($key, $left)) {
                $left[$key] = $this->mergeJsLayoutArrays($left[$key], $value);
            } else {
                $left[$key] = $value;
            }
        }

        return $left;
    }
}
