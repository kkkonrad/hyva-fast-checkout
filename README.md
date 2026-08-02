# Kkkonrad Fastcheckout

Fastcheckout to moduł procesu zamówienia Magento 2 przeznaczony dla motywów Hyvä.
Renderuje standardowe komponenty Knockout Magento odpowiedzialne za adresy i
płatności wewnątrz układu Hyvä. Natywny koszyk Magento oraz operacje REST pozostają
jedynym źródłem danych.

Moduł nie wymaga Magewire i nie utrzymuje dodatkowego stanu procesu zamówienia.

## Podgląd

![Widok procesu zamówienia Kkkonrad Fastcheckout](docs/images/checkout.png)

## Funkcje

- responsywny układ procesu zamówienia zgodny z Hyvä;
- standardowe formularze adresu wysyłki i adresu rozliczeniowego Magento wraz z
  natywną walidacją;
- natywny bootstrap RequireJS Magento i warstwa zgodności rendererów płatności
  Knockout;
- mapowanie metod płatności do metod dostawy;
- zachowanie adresu gościa po odświeżeniu strony;
- obsługa komentarzy do zamówienia i zapisu do newslettera;
- zachowanie atrybutu rozszerzającego automatu paczkowego InPost;
- opcjonalne przypisanie zamówienia gościa do istniejącego klienta o tym samym
  adresie e-mail.

## Wymagania

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 lub nowszy.

## Instalacja

Instalacja za pomocą Composera:

```bash
composer require kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

W środowisku produkcyjnym należy dodatkowo skompilować DI i wdrożyć pliki
statyczne:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

Moduł rejestruje swoje szablony w konfiguracji Tailwind Hyvä. Po instalacji lub
zmianie szablonów procesu zamówienia należy ponownie zbudować CSS aktywnego motywu.

## Konfiguracja

Konfiguracja jest dostępna w panelu administracyjnym:

`Stores > Configuration > Kkkonrad > Checkout`

Ustawienia pozwalają włączyć moduł, sterować widocznością komentarza, rabatu i
newslettera, opcjonalnie przypisywać zamówienia gości oraz definiować mapowanie
metod płatności do metod dostawy.

Proces zamówienia jest dostępny pod standardową ścieżką `/checkout/`. Gdy moduł oraz
zgodny motyw Hyvä są aktywne, Fastcheckout zastępuje zawartość tej strony bez
dodatkowego przekierowania. Dotychczasowa ścieżka `/fast-checkout/` pozostaje
dostępna jako alias zapewniający zgodność wsteczną.

## Architektura

- `Block/Hyva/Checkout.php` jednokrotnie scala standardowy `jsLayout` i przekazuje
  go natywnym procesorom checkoutu Magento.
- `view/frontend/web/js/requirejs-base.js` ustawia ścieżkę zasobów przed natywnym
  bootstrapem RequireJS, również przy włączonej minifikacji i łączeniu JavaScript.
- Magento ładuje własną konfigurację RequireJS; szablon
  `view/frontend/templates/hyva/knockout/checkout-bridge.phtml` uruchamia wyłącznie
  most Knockout.
- `view/frontend/web/js/hyva/checkout-bridge.js` montuje komponenty procesu
  zamówienia Magento.
- Obiekty Magento `quote`, `checkout-data` oraz operacje REST zarządzają adresami,
  metodami i podsumowaniem.
- Niewielkie mixiny RequireJS zapewniają trwałość danych i zgodność z zewnętrznymi
  modułami płatności.

Moduł nie zawiera komponentu Magewire, mechanizmu modyfikowania DOM przez Livewire
ani orkiestratora stanu opartego na Alpine.

## Testy

Uruchomienie testów jednostkowych PHP z katalogu głównego Magento:

```bash
vendor/bin/phpunit --no-extensions -c dev/tests/unit/phpunit.xml.dist \
    app/code/Kkkonrad/Fastcheckout/Test/Unit
```

Uruchomienie testów jednostkowych JavaScript:

```bash
node --test app/code/Kkkonrad/Fastcheckout/Test/Unit/Js/*.test.js
```

Uruchomienie testów Playwright:

```bash
cd app/code/Kkkonrad/Fastcheckout/Test/E2e
npm ci
npx playwright test
```

Testy składające rzeczywiste zamówienia są domyślnie pomijane. Można je
uruchomić świadomie przez `FC_PLACE_REAL_ORDER=1`. Test ciepłego startu formularza
adresu wymaga gotowości w ciągu 1000 ms od `DOMContentLoaded`; dla innego
środowiska limit można ustawić przez `FC_ADDRESS_READY_BUDGET_MS`.
