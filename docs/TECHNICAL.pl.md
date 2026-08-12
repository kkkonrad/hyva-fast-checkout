[English](TECHNICAL.md) | Polski

# Dokumentacja techniczna Kkkonrad Fastcheckout

[← README dla właściciela sklepu](../README.pl.md)

Fastcheckout jest hostem natywnego checkoutu Magento opartego na KnockoutJS,
RequireJS i REST. Dokument opisuje kontrakty techniczne zachowywane przez moduł
oraz sposób jego utrzymania i testowania.

## Walidacja i składanie zamówienia

Widoczne przyciski desktop/mobile są proxy. Nie implementują płatności i nie
wywołują endpointu samodzielnie: klikają natywny przycisk `placeOrder` aktywnego
renderera. Dzięki temu PayU, Przelewy24, Stripe i inne moduły zachowują własne
tokenizacje, zgody oraz walidatory.

Przy próbie złożenia zamówienia Fastcheckout:

1. przy braku płatności wywołuje `shipping.validateShippingInformation()` i
   pokazuje komunikat płatności dopiero po poprawnej dostawie;
2. przy wybranej płatności przygotowuje adres rozliczeniowy przez natywny
   komponent `Magento_Checkout/js/view/billing-address`;
3. przekazuje sterowanie aktywnemu rendererowi i jego `validate()`;
4. renderer uruchamia standardowy `additional-validators`, w którym Fastcheckout
   rejestruje walidację shipping/billing obok walidatorów e-maila, zgód i modułów
   zewnętrznych;
5. współdzielony koordynator wywołuje natywną akcję
   `Magento_Checkout/js/action/set-shipping-information` tylko wtedy, gdy adres
   lub metoda dostawy zmieniły się od ostatniego poprawnego zapisu, po czym
   renderer składa zamówienie własną akcją Magento.

Komunikat o braku płatności jest wyświetlany przed dynamiczną listą metod,
przewijany do widoku i usuwany przez zmianę `quote.paymentMethod`. Podczas
wysyłania przyciski są blokowane i pokazują „Proszę czekać”; po błędzie wracają
do stanu aktywnego.

Zgody w trybie ręcznym pozostają aktywnymi checkboxami. Zgody automatyczne są
widoczne, zaznaczone i zablokowane, a treść zgody otwiera się w natywnym modalu
Magento.

## Architektura

- Kontroler `/checkout/` pozostaje `Magento\Checkout\Controller\Index\Index`.
  Standardowy event `layout_load_before` dodaje handle
  `fastcheckout_index_index` przed scaleniem layoutu; moduł nie pluginuje ani nie
  omija kontrolera checkoutu.
- Fastcheckout przełącza kontekst motywu wyłącznie na czas zbudowania
  izolowanego layoutu `Magento/luma` dla handle `checkout_index_index` oraz
  prywatnego `fastcheckout_native_components`. Robi to bezpośrednio przez
  `Magento\Framework\View\Design\Theme\ThemeProviderInterface`, bez pakietu
  Hyvä Theme Fallback. Oryginalny motyw Hyvä jest zawsze przywracany w `finally`;
  Luma nie renderuje strony ani nie publikuje swoich zasobów klientowi.
- Izolowany layout sprawia, że walidator, newsletter i komentarz Fastcheckout nie
  są rejestrowane w zwykłym checkoutcie, natomiast wszystkie layout processory i
  wpisy `jsLayout` modułów zewnętrznych trafiają do oryginalnego `checkout.root`.
  Przetworzone drzewo jest pobierane przez `checkout.root::getJsLayout()` bez
  tworzenia drugiego bloku `Onepage`; zmiany prezentacyjne wykonuje końcowy
  `LayoutProcessorInterface` Fastcheckout.
- Izolowany layout nie ładuje globalnego handle `default`, więc nie przygotowuje
  globalnych bloków RequireJS aktywnego motywu podczas renderowania strony.
- Pełny, scalony `jsLayout` jest uruchamiany dokładnie raz przez
  `Magento_Ui/js/core/app`. Fastcheckout zmienia wyłącznie niezmodyfikowane
  szablony core odpowiedzialne za prezentację i zachowuje template’y ustawione
  przez zewnętrzne layout processory. Własny szablon listy dostaw nadal deleguje
  pojedynczy wiersz do `shippingMethodItemTemplate`, tak jak core.
- Stronę renderuje jedna instancja bloku Fastcheckout. Stawki oraz podsumowanie
  nie mają równoległego fallbacku PHP: ich jedynym źródłem są natywne
  `shipping-service`, `totals` i komponenty `checkout.sidebar.summary`.
- Magento zachowuje własne komponenty `shipping`, `payment`, `payments-list`,
  `renderer-list`, `shipping-service`, `checkout-data` i `quote` bez forków.
- Integracje z core JS są rejestrowane wyłącznie jako mixiny RequireJS — bez
  `map` i bez forków. Dotyczą `Magento_Checkout/js/action/place-order`,
  natywnego summary, `Magento_SalesRule/js/view/payment/discount` i
  `Magento_CheckoutAgreements/js/view/checkout-agreements`.
- Pole komentarza pozostaje w panelu podsumowania, a newsletter jest dzieckiem
  regionu `before-place-order` z `sortOrder=90`. Standardowe zgody oraz
  newsletter mają w podsumowaniu zsynchronizowane proxy prezentacyjne; ich
  oryginalne kontrolki, nazwy pól, kontekst KO i walidatory pozostają w aktywnym
  rendererze płatności. Zawartość rendererów zewnętrznych nie jest przenoszona
  ani klonowana.
- Stan komentarza i newslettera należy do standardowego `checkoutProvider` pod
  `fastcheckout.comment` oraz `fastcheckout.subscribe`; do płatności trafia
  wyłącznie przez zarejestrowane `PaymentInterface.extension_attributes` i jest
  konsumowany wyłącznie przez zamówienie o odpowiadającym `quote_id`.
- Strona sukcesu zachowuje core `Magento\Checkout\Block\Onepage\Success`, a
  komentarz i newsletter są zapisywane przez
  `OrderStatusHistoryRepositoryInterface` i `SubscriptionManagerInterface`.

Moduł nie zawiera komponentu Magewire, mechanizmu modyfikowania DOM przez
Livewire ani orkiestratora stanu opartego na Alpine.

## Zgodność z modułami zewnętrznymi

Fastcheckout działa jak host natywnego checkoutu Magento Knockout + REST.
**Instalacja standardowego modułu dostawy lub płatności nie powinna wymagać
patchy ani wpisów DI w Kkkonrad_Fastcheckout.**

- Renderery płatności i komponenty UI dostawy pochodzą ze standardowego,
  dynamicznie scalonego handle `checkout_index_index`.
- Zewnętrzny root `#checkout` i wewnętrzny `#fastcheckout-checkout` są obecne
  równocześnie, dlatego selektory modułów ograniczone do `#checkout` nadal
  działają.
- Standardowe identyfikatory `#shipping`, `#checkout-step-shipping`,
  `#opc-shipping_method`, `#co-shipping-method-form`, `#payment`,
  `#checkout-step-payment` i `#co-payment-form` pozostają dostępne bez zmiany
  układu wizualnego.
- `shippingAdditional`, `before-shipping-method-form`, `beforeMethods`,
  `afterMethods`, `before-place-order`, `payments-list` i `renderer-list`
  pozostają w oryginalnych miejscach. `checkout.sidebar.shipping-information`
  jest renderowany przez kanoniczny region komponentu `checkout.sidebar`.
- Każda metoda dostawy zachowuje standardowe identyfikatory etykiet oraz pusty
  host `label_method_{method_code}_{carrier_code}` dla widgetów przewoźników.
- Obcy `shippingMethodListTemplate` lub `shippingMethodItemTemplate` ustawiony
  przez layout processor ma pierwszeństwo przed szablonem prezentacyjnym modułu.
- Fastcheckout nie zastępuje `window.checkoutConfig`, nie zapisuje własnego
  checkout store i nie odtwarza `extension_attributes` z bazy. Natywny przycisk
  zamówienia pozostaje w rendererze wraz z handlerami i jest wywoływany przez
  widoczne proxy; pozostałe akcje toolbara nie są ukrywane.
- `ExtendedCheckoutConfigProvider` jest dopinany do
  `Magento\Checkout\Model\CompositeConfigProvider` z `sortOrder=1000`; moduł nie
  zastępuje interfejsów zarządzania informacjami dostawy ani płatności.
- Mapowanie shipping→payment jest dodatkową specyfikacją
  `Magento\Payment\Model\Checks\SpecificationInterface`; dzięki temu identyczna
  lista metod trafia do początkowego `checkoutConfig` i odpowiedzi REST, bez
  mixina na `payment-service`.
- Mixiny nie są rejestrowane na akcjach wyboru adresu lub metody, transporcie
  REST, rate processorach ani `customer-data`, więc łańcuchy innych vendorów
  pozostają nienaruszone.
- Walidator one-step jest zwykłym dzieckiem kanonicznego węzła
  `checkout.steps.billing-step.payment.additional-payment-validators`; nie
  zastępuje listy ani walidatorów rejestrowanych przez inne moduły.

Nie dodawaj per-vendor DI „pod Fastcheckout” w projekcie sklepu, jeśli ten sam
renderer jest już ładowany przez standardowy `checkout_index_index` Magento.

## Testy

Testy jednostkowe PHP uruchamiane z katalogu głównego Magento:

```bash
vendor/bin/phpunit --no-extensions -c dev/tests/unit/phpunit.xml.dist \
    app/code/Kkkonrad/Fastcheckout/Test/Unit
```

Testy jednostkowe JavaScript:

```bash
node --test app/code/Kkkonrad/Fastcheckout/Test/Unit/Js/*.test.js
```

Testy Playwright:

```bash
cd app/code/Kkkonrad/Fastcheckout/Test/E2e
npm ci
npx playwright test
```

Testy E2E domyślnie nie składają zamówień. Sprawdzają natywny bootstrap,
kanoniczne wpisy `uiRegistry`, regiony rozszerzeń, synchronizację
billing=shipping, zgody/newsletter, dynamiczne płatności, przewijanie do błędów,
loader oraz pełny łańcuch walidatorów.

Jawny test końcowego zamówienia Purchase Order na izolowanym sklepie testowym:

```bash
FC_ALLOW_PLACE_ORDER=1 npx playwright test \
    -g 'validates shipping and Purchase Order, optionally placing an order'
```

## Odświeżanie plików statycznych

Po zmianach w `view/frontend/web` odśwież opublikowane kopie Magento w
`pub/static`, aby storefront nie serwował starego JS lub CSS:

```bash
app/code/Kkkonrad/Fastcheckout/bin/sync-frontend-static.sh
php bin/magento cache:flush
```

Skrypt jest potrzebny, gdy katalogi
`pub/static/frontend/*/Kkkonrad_Fastcheckout` już istnieją, również w trybie
developer. `requirejs-config.js` leży poza `web/`; po jego zmianie skopiuj go do
drzew static albo ponownie uruchom wdrożenie plików statycznych. Samo przeładowanie
strony nie zastąpi istniejącej kopii.

Jeśli Magento używa Subresource Integrity i istnieje
`pub/static/frontend/sri-hashes.json`, skrypt celowo przerwie pracę. W takim
środowisku przenieś lub usuń wyłącznie istniejące katalogi
`pub/static/frontend/<Vendor>/<theme>/<locale>/Kkkonrad_Fastcheckout`, a następnie
uruchom `setup:static-content:deploy`. Magento może nie nadpisać istniejącego
pliku, a tylko natywne wdrożenie odtworzy go z poprawnym hashem SRI.

Nie edytuj ręcznie `pub/static/deployed_version.txt`; skrypt zapisuje poprawną
wersję zasobów bez końcowego znaku nowej linii.
