<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Translation;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;
use Magento\Framework\Component\ComponentRegistrar;

class PolishCatalogTest extends TestCase
{
    /**
     * @return array<string, true>
     */
    private function loadTranslations(string $file): array
    {
        $translations = [];
        if (!is_file($file)) {
            return $translations;
        }

        $handle = fopen($file, 'r');
        while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (isset($row[0]) && $row[0] !== '') {
                $translations[$row[0]] = true;
            }
        }
        fclose($handle);

        return $translations;
    }

    public function testFrontendLiteralsComeFromLanguagePackOrFastcheckoutCatalog(): void
    {
        $moduleRoot = dirname(__DIR__, 3);
        $moduleTranslations = $this->loadTranslations($moduleRoot . '/i18n/pl_PL.csv');
        $standardTranslations = [];
        $registrar = new ComponentRegistrar();

        foreach ($registrar->getPaths(ComponentRegistrar::LANGUAGE) as $path) {
            $standardTranslations += $this->loadTranslations($path . '/pl_PL.csv');
        }

        self::assertNotSame([], $standardTranslations, 'No pl_PL language pack is registered.');
        $duplicates = array_keys(array_intersect_key($moduleTranslations, $standardTranslations));
        sort($duplicates);
        self::assertSame(
            [],
            $duplicates,
            'Fastcheckout must not duplicate standard pl_PL translations.'
        );

        $translations = $moduleTranslations + $standardTranslations;

        $missing = [];
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($moduleRoot . '/view/frontend')
        );
        foreach ($files as $file) {
            if (!$file instanceof SplFileInfo || !$file->isFile() ||
                !preg_match('/\.(?:php|phtml|js)$/', $file->getFilename())) {
                continue;
            }

            preg_match_all(
                '/(?:__|\$t|translate|translateMessage|translateClientMessage|translateFastcheckoutMessage)' .
                '\(\s*([\'\"])((?:\\\\.|(?!\1).)*)\1/sU',
                (string)file_get_contents($file->getPathname()),
                $matches,
                PREG_SET_ORDER
            );
            foreach ($matches as $match) {
                $phrase = stripcslashes($match[2]);
                if ($phrase !== '' && !isset($translations[$phrase])) {
                    $missing[$phrase][] = substr($file->getPathname(), strlen($moduleRoot) + 1);
                }
            }
        }

        self::assertSame([], $missing, 'Missing pl_PL translations: ' . json_encode($missing));
    }
}
