# Kkkonrad Fastcheckout

Fastcheckout to moduł procesu zamówienia Magento 2 przeznaczony dla motywów Hyvä.
Uruchamia standardowy checkout Knockout Magento przez oficjalny mechanizm Hyvä
Theme Fallback i nakłada własną warstwę wizualną. Natywny koszyk Magento oraz
operacje REST pozostają jedynym źródłem danych.

Moduł nie wymaga Magewire i nie utrzymuje dodatkowego stanu procesu zamówienia.

## Podgląd

![Widok procesu zamówienia Kkkonrad Fastcheckout](docs/images/checkout.png)

## Funkcje

- responsywny układ procesu zamówienia zgodny z Hyvä;
- standardowe formularze adresu wysyłki i adresu rozliczeniowego Magento wraz z
  natywną walidacją;
- zawsze dostępny przycisk „Złóż zamówienie” na desktopie i mobile, delegujący
  wykonanie do przycisku aktywnego renderera płatności;
- walidacja w kolejności adres → dostawa → płatność → walidatory aktywnego
  renderera, z płynnym przewinięciem do pierwszego widocznego błędu;
- natywny bootstrap RequireJS i dokładnie jeden, pełny `Magento_Ui/js/core/app`;
- niezmienione ścieżki komponentów `checkout.*` i `checkoutProvider`, dzięki czemu
  renderery płatności oraz dodatki dostawy działają tak samo jak w core;
- dynamiczna lista metod płatności Magento; cała zamknięta karta metody jest
  klikalna, a ukryte radio jedynej metody otrzymuje wizualny stan zaznaczenia;
- mapowanie metod płatności do metod dostawy;
- natywne podsumowanie i totals Magento, w tym Tax;
- obsługa komentarzy, newslettera i `Magento_CheckoutAgreements` przed przyciskiem
  zamówienia, bez odłączania ich od natywnej walidacji płatności;
- opcjonalne przypisanie zamówienia gościa do istniejącego klienta o tym samym
  adresie e-mail.

## Wymagania

- Magento 2.4 (`magento/framework` 103.x);
- PHP 8.1–8.4;
- Hyvä Theme Module 1.4 lub nowszy;
- Hyvä Theme Fallback 1.x (instalowany jako zależność Composer modułu).

## Instalacja

Pakiet **nie jest dostępny na Packagist**. Instalacja odbywa się przez Composer
bezpośrednio z GitHuba (repozytorium VCS).

### Composer + GitHub

W katalogu głównym Magento dodaj repozytorium i wymagaj pakietu:

```bash
composer config repositories.kkkonrad-fastcheckout vcs https://github.com/kkkonrad/hyva-fast-checkout.git
composer require kkkonrad/fastcheckout:dev-master
```

Albo ręcznie w `composer.json` projektu:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/kkkonrad/hyva-fast-checkout.git"
    }
  ],
  "require": {
    "kkkonrad/fastcheckout": "dev-master"
  }
}
```

Następnie:

```bash
composer update kkkonrad/fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

**Uwagi:**

- dla prywatnego repozytorium użyj SSH (`git@github.com:kkkonrad/hyva-fast-checkout.git`)
  albo tokenu GitHub w HTTPS i uprawnień Composer do `github.com`;
- zamiast `dev-master` można wskazać gałąź (`dev-nazwa-galezi`) lub tag
  (`"kkkonrad/fastcheckout": "8.0.0"`), jeśli jest opublikowany w repozytorium;
- przy instalacji z gałęzi Composer często prosi o `minimum-stability: dev`
  oraz `prefer-stable: true` w `composer.json` projektu.

### Instalacja ręczna (app/code)

Alternatywnie sklonuj moduł do `app/code`:

```bash
git clone https://github.com/kkkonrad/hyva-fast-checkout.git app/code/Kkkonrad/Fastcheckout
php bin/magento module:enable Kkkonrad_Fastcheckout
php bin/magento setup:upgrade
php bin/magento cache:clean
```

### Środowisko produkcyjne

W środowisku produkcyjnym należy dodatkowo skompilować DI i wdrożyć pliki
statyczne:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f pl_PL en_US
```

Style checkoutu są dostarczane jako zwykły zasób CSS modułu; nie wymagają
przebudowy konfiguracji Tailwind aktywnego motywu.

## Konfiguracja

Konfiguracja jest dostępna w panelu administracyjnym:

`Stores > Configuration > Kkkonrad > Checkout`

Ustawienia pozwalają włączyć moduł, sterować widocznością komentarza, rabatu i
newslettera, opcjonalnie przypisywać zamówienia gości oraz definiować mapowanie
metod płatności do metod dostawy.

Przypisywanie zamówienia gościa do istniejącego konta jest domyślnie wyłączone.
Włącz je tylko wtedy, gdy sklep niezależnie potwierdza własność adresu e-mail.

Proces zamówienia jest dostępny pod standardową ścieżką `/checkout/`. Gdy moduł oraz
zgodny motyw Hyvä są aktywne, Fastcheckout dodaje własny handle prezentacyjny do
layoutu natywnego kontrolera Magento. Dotychczasowa ścieżka `/fast-checkout/`
pozostaje dostępna ze względów zgodności wstecznej.

## Walidacja i składanie zamówienia

Widoczne przyciski desktop/mobile są proxy. Nie implementują płatności i nie
wywołują endpointu samodzielnie: po pomyślnej walidacji klikają natywny przycisk
`placeOrder` aktywnego renderera. Dzięki temu PayU, Przelewy24, Stripe i inne
moduły zachowują własne tokenizacje, zgody oraz walidatory.

Przy próbie złożenia zamówienia Fastcheckout:

1. uruchamia natywną walidację e-maila i adresu wysyłki;
2. wywołuje `shipping.validateShippingInformation()`, łącznie z walidatorami
   przewoźnika, np. wyborem paczkomatu;
3. sprawdza wybór płatności dopiero po poprawnej dostawie;
4. synchronizuje i waliduje adres rozliczeniowy, domyślnie równy adresowi wysyłki;
5. przekazuje sterowanie aktywnemu rendererowi płatności i jego `validate()`.

Komunikat o braku płatności jest wyświetlany przed dynamiczną listą metod,
przewijany do widoku i usuwany przez zmianę `quote.paymentMethod`. Podczas
wysyłania przyciski są blokowane i pokazują „Proszę czekać”; po błędzie wracają
do stanu aktywnego.

Zgody w trybie ręcznym pozostają aktywnymi checkboxami. Zgody automatyczne są
widoczne, zaznaczone i zablokowane, a treść zgody otwiera się w natywnym modalu
Magento.

## Architektura

- Kontroler `/checkout/` pozostaje `Magento\Checkout\Controller\Index\Index`.
  Standardowy event `layout_load_before` dodaje handle `fastcheckout_index_index`
  przed scaleniem layoutu; moduł nie pluginuje ani nie omija kontrolera checkoutu.
- Fastcheckout buduje izolowany layout motywu fallback dla handle
  `checkout_index_index`, dzięki czemu wszystkie layout processory i wpisy
  `jsLayout` z modułów zewnętrznych trafiają do oryginalnego `checkout.root`.
  Izolowany layout nie ładuje globalnego handle `default`, więc nie regeneruje
  assetów RequireJS aktywnego motywu podczas renderowania strony.
- Pełny, scalony `jsLayout` jest uruchamiany dokładnie raz przez
  `Magento_Ui/js/core/app`; Fastcheckout zmienia wyłącznie trzy ścieżki szablonów
  odpowiedzialne za dotychczasowy wygląd.
- Magento zachowuje własne komponenty `shipping`, `payment`, `payments-list`,
  `renderer-list`, `shipping-service`, `checkout-data` i `quote` bez forków.
- Integracje z core JS są rejestrowane wyłącznie jako mixiny RequireJS — bez
  `map` i bez forków. Dotyczą `Magento_Checkout/js/action/place-order`,
  `Magento_Checkout/js/model/payment-service`, natywnego summary,
  `Magento_SalesRule/js/view/payment/discount` i
  `Magento_CheckoutAgreements/js/view/checkout-agreements`.
- Pole komentarza pozostaje w panelu podsumowania, a newsletter jest dzieckiem
  regionu `before-place-order` z `sortOrder=90`. Standardowe zgody oraz newsletter
  mają w podsumowaniu zsynchronizowane proxy prezentacyjne; ich oryginalne kontrolki,
  nazwy pól, kontekst KO i walidatory pozostają w aktywnym rendererze płatności.
  Zawartość rendererów zewnętrznych nie jest przenoszona ani klonowana.

Moduł nie zawiera komponentu Magewire, mechanizmu modyfikowania DOM przez Livewire
ani orkiestratora stanu opartego na Alpine.

## Zgodność z modułami zewnętrznymi (shipping / payment)

Fastcheckout działa jak host natywnego checkoutu Magento Knockout + REST.
**Instalacja standardowego modułu dostawy lub płatności nie powinna wymagać
patchy ani wpisów DI w Kkkonrad_Fastcheckout.**

- Renderery płatności i komponenty UI dostawy pochodzą ze standardowego,
  dynamicznie scalonego handle `checkout_index_index`.
- Zewnętrzny root `#checkout` i wewnętrzny `#fastcheckout-checkout` są obecne
  równocześnie, dlatego selektory modułów ograniczone do `#checkout` nadal działają.
- `shippingAdditional`, `before-shipping-method-form`, `beforeMethods`,
  `afterMethods`, `before-place-order`, `payments-list` i `renderer-list` pozostają
  w oryginalnych miejscach. `checkout.sidebar.shipping-information` jest renderowany
  przez kanoniczny region komponentu `checkout.sidebar`.
- Każda metoda dostawy zachowuje standardowe identyfikatory etykiet oraz pusty host
  `label_method_{method_code}_{carrier_code}` dla widgetów przewoźników.
- Fastcheckout nie zastępuje `window.checkoutConfig`, nie zapisuje własnego checkout
  store i nie odtwarza `extension_attributes` z bazy. Natywny przycisk zamówienia
  pozostaje w rendererze wraz z handlerami i jest wywoływany przez widoczne proxy;
  pozostałe akcje toolbara nie są ukrywane.
- `ExtendedCheckoutConfigProvider` jest dopinany do
  `Magento\Checkout\Model\CompositeConfigProvider` z `sortOrder=1000`; moduł nie
  zastępuje interfejsów zarządzania informacjami dostawy ani płatności.
- Mixiny nie są rejestrowane na akcjach wyboru adresu/metody, transporcie REST,
  rate processorach ani `customer-data`, więc łańcuchy innych vendorów pozostają
  nienaruszone.

Nie dodawaj per-vendor DI „pod Fastcheckout” w projekcie sklepu, jeśli standardowy
checkout Magento w motywie fallback już ładuje ten sam renderer.

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

Testy E2E domyślnie nie składają zamówień. Sprawdzają natywny bootstrap,
kanoniczne wpisy `uiRegistry`, regiony rozszerzeń, synchronizację billing=shipping,
zgody/newsletter, dynamiczne płatności, przewijanie do błędów, loader oraz pełny
łańcuch walidatorów.
Jawny test końcowego zamówienia Purchase Order na izolowanym sklepie testowym
uruchom przez:

```bash
FC_ALLOW_PLACE_ORDER=1 npx playwright test \
    -g 'validates shipping and Purchase Order, optionally placing an order'
```

## Odświeżanie plików statycznych (developer / hosty on-demand)

Po zmianach w `view/frontend/web` odśwież opublikowane kopie Magento w
`pub/static`, żeby storefront nie serwował starego JS/CSS:

```bash
app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
php bin/magento cache:flush
```

Skrypt jest wymagany, gdy katalogi
`pub/static/frontend/*/Kkkonrad_Fastcheckout` już istnieją (również w trybie
developer). `requirejs-config.js` leży poza `web/` — po jego zmianie skopiuj go
do drzew static albo uruchom ponownie wdrożenie plików statycznych; samo przeładowanie
strony nie zastąpi istniejącej kopii.
Nie edytuj ręcznie `pub/static/deployed_version.txt`; skrypt zapisuje poprawną,
pozbawioną końcowego znaku nowej linii wersję zasobów.
