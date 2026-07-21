# Szczegółowa Dokumentacja Integracji KO (Knockout.js Bridge)

Most integracyjny KO (Knockout.js) w module **Fastcheckout** to zaawansowany system uruchamiający izolowane, kompatybilne środowisko Knockout.js i RequireJS wewnątrz sklepu opartego na szablonie **Hyvä**. Pozwala on na uruchomienie tradycyjnych wtyczek płatności bez konieczności przepisywania ich na Alpine.js.

---

## 1. Wykrywanie i Generowanie Zasobów RequireJS

Most opiera się na bibliotece RequireJS. W środowisku Hyvä tradycyjne pliki JS koszyka nie są ładowane. Moduł dynamicznie dba o to, by zasoby te były dostępne:
- **[Model/Hyva/RequireJsAssets.php](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/Model/Hyva/RequireJsAssets.php)**: 
  Metoda `ensure($storeId)` sprawdza w katalogu plików statycznych (`pub/static`) obecność dwóch kluczowych plików:
  1. `requirejs/require.js` – plik silnika RequireJS.
  2. `requirejs-config.js` – scalona konfiguracja mapowania modułów RequireJS.
  Jeśli plików brakuje, są one kompilowane i publikowane w locie za pomocą publishera zasobów.

---

## 2. Inicjalizacja Mostu na Frontendzie (`checkout-bridge.phtml`)

Szablon [checkout-bridge.phtml](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/templates/hyva/knockout/checkout-bridge.phtml) wstrzykuje izolowany kontener KO i zarządza kolejnością ładowania skryptów:

### A. Bezpieczny Getter/Setter dla `window.checkoutConfig`
Zewnętrzne wtyczki (np. PayPal Braintree) często próbują nadpisać cały obiekt `window.checkoutConfig`. Aby temu zapobiec, w szablonie zaimplementowano mechanizm `Object.defineProperty`:
```javascript
Object.defineProperty(window, 'checkoutConfig', {
    get: function() { return actualConfig; },
    set: function(newConfig) {
        if (newConfig && typeof newConfig === 'object') {
            actualConfig = Object.assign(actualConfig, newConfig);
        } else {
            actualConfig = newConfig;
        }
        if (actualConfig && typeof actualConfig === 'object') {
            actualConfig.payment = initPaymentProxy(actualConfig.payment);
        }
    },
    configurable: true,
    enumerable: true
});
```

### B. JavaScript Proxy zapobiegające błędom braku kluczy
Funkcja `initPaymentProxy` opakowuje konfigurację płatności w obiekt `Proxy`:
```javascript
var initPaymentProxy = function(paymentObj) {
    paymentObj = paymentObj || {};
    if (paymentObj.__isProxy) return paymentObj;
    return new Proxy(paymentObj, {
        get: function(target, prop) {
            if (prop === '__isProxy') return true;
            if (prop === '__raw__') return target;
            if (typeof prop === 'string' && !(prop in target)) {
                target[prop] = {}; // Automatycznie twórz pusty obiekt, jeśli klucz nie istnieje
            }
            return target[prop];
        }
    });
};
```
Dzięki temu odczyt głęboko zagnieżdżonych i niezdefiniowanych kluczy (np. `checkoutConfig.payment.stripe_payments.cc_fields`) nie kończy się krytycznym błędem w konsoli.

### C. Opóźniona inicjalizacja
Skrypt nasłuchuje zdarzeń `magewire:available` lub `livewire:available`. Dopiero po załadowaniu backendu asynchronicznego, wczytywana jest biblioteka `require.js`, a następnie konfiguracja mixinów i główny inicjalizator renderera płatności.

---

## 3. Emulacja środowiska KO w `checkout-bridge.js`

Główny plik JS mostu ([checkout-bridge.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/web/js/hyva/checkout-bridge.js)) dostarcza atrapy (mocki) brakujących obiektów i rejestrów Magento:

- **Atrapy Adresów koszyka (Quote Addresses)**: 
  Moduły płatności KO wywołują na adresach metodę `.getCacheKey()`. Most podmienia obiekty `quote.billingAddress` oraz `quote.shippingAddress` tak, by zwracały statyczny klucz i implementowały subskrypcje KO:
  ```javascript
  currentBilling.getCacheKey = function () { return 'billing-address-placeholder'; };
  ```
- **Fallback dla `checkoutProvider`**:
  Funkcja `createCheckoutProviderFallback()` tworzy obiekt emulujący standardowy provider danych Magento (zarządza nasłuchiwaniem zdarzeń `.on()`, wyzwalaniem `.trigger()`, pobieraniem danych `.get()` oraz słownikami krajów).
- **Atrapa komponentu `shippingAddress`**:
  Tworzy obiekt `fastcheckout.shippingAddress` i rejestruje go w `uiRegistry`. Dostarcza on metody walidacji `validateShippingInformation()` oraz komunikaty o błędach.
- **Komunikaty o błędach (Messages & MessageList)**:
  Większość modułów KO raportuje błędy do globalnego obiektu `messageList`. Most subskrybuje te listy błędów:
  ```javascript
  messageContainer.errorMessages.subscribe(function (messages) {
      if (messages && messages.length) {
          dispatchPaymentMessage('error', messages[messages.length - 1]);
      }
  });
  ```
  Zdarzenie to jest następnie konwertowane na natywny event JS `fastcheckout:payment-error`, który przechwytuje Alpine.js i wyświetla błąd w głównym widoku koszyka Hyvä.

---

## 4. Mixiny RequireJS (Przechwytywanie Przepływu)

W pliku [requirejs-config.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/requirejs-config.js) zadeklarowano mixiny dla standardowych akcji koszyka Magento:

| Nazwa Mixinu | Targetowany komponent KO | Opis i Rola w Moście |
| :--- | :--- | :--- |
| `checkout-data-mixin` | `Magento_Checkout/js/checkout-data` | Dodaje obsługę metod zapisu i odczytu punktów Paczkomatów InPost w `localStorage`. |
| `customer-data-mixin` | `Magento_Customer/js/customer-data` | Synchronizuje dane sesji i koszyka (Private Content) dwukierunkowo między Hyva i KO. |
| `storage-mixin` | `mage/storage` | Interceptor zapytań REST API (GET/POST/PUT/DELETE) tłumaczonych na lokalne wywołania Magewire. |
| `select-billing-address-mixin` | `Magento_Checkout/js/action/select-billing-address` | Przekazuje informację o wyborze adresu rozliczeniowego do mostu Alpine.js. |
| `select-payment-method-mixin` | `Magento_Checkout/js/action/select-payment-method` | Synchronizuje stan wybranej metody płatności z Magewire. |
| `place-order-mixin` | `Magento_Checkout/js/action/place-order` | Interceptuje składanie zamówienia w KO i przekazuje je do obsługi przez Magewire. |
| `set-payment-information-mixin` | `Magento_Checkout/js/action/set-payment-information` | Przechwytuje zapis danych płatności w KO i kieruje je do Magewire. |
| `set-payment-information-extended-mixin` | `Magento_Checkout/js/action/set-payment-information-extended` | Rozszerzona wersja zapisu danych płatności KO zintegrowana z Magewire. |
| `set-billing-address-mixin` | `Magento_Checkout/js/action/set-billing-address` | Przechwytuje akcję zapisu adresu rozliczeniowego i przesyła go do Magewire. |
| `get-payment-information-mixin` | `Magento_Checkout/js/action/get-payment-information` | Blokuje standardowe zapytania REST pobierania płatności KO i pobiera dane z Magewire. |
| `get-totals-mixin` | `Magento_Checkout/js/action/get-totals` | Przekierowuje zapytania o podsumowanie koszyka z KO do Magewire. |
| `recollect-shipping-rates-mixin` | `Magento_Checkout/js/action/recollect-shipping-rates` | Wywołuje asynchroniczne przeliczenie kurierów w Magewire zamiast zapytań REST KO. |

---

## 5. Integracja z Braintree (`braintree-adapter-mixin.js`)

Plik [braintree-adapter-mixin.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/web/js/mixin/braintree-adapter-mixin.js) opakowuje metodę `tokenizeHostedFields` oficjalnego modułu `PayPal_Braintree`.

W przypadku wystąpienia błędów walidacji (np. puste pola karty kredytowej lub nieprawidłowy kod CVV), mixin wykonuje:
1. **Wizualne podświetlenie błędów**:
   Mapuje klucze Braintree (`number`, `expirationDate`, `cvv`) na identyfikatory pól w DOM (`braintree_cc_number`, `braintree_expirationDate`, `braintree_cc_cid`) i dodaje klasę CSS `.braintree-hosted-fields-invalid`, nadając im czerwoną ramkę.
2. **Tłumaczenie komunikatów**:
   Podmienia standardowe, surowe błędy API Braintree na przyjazne komunikaty w języku polskim:
   - `HOSTED_FIELDS_FIELDS_EMPTY` -> *"Proszę wypełnić wszystkie pola karty kredytowej."*
   - `HOSTED_FIELDS_FIELDS_INVALID` -> *"Niektóre pola karty kredytowej są niepoprawne. Sprawdź wpisane dane."*
3. **Odblokowanie formularza**:
   Wywołuje metodę odrzucenia obietnicy w moście (`window.fastcheckoutHyvaPayment.syncReject`), co informuje komponent Alpine.js o konieczności zatrzymania spinnera i odblokowania przycisku składania zamówienia na stronie.

---

## 6. Synchronizacja Danych Prywatnych (CustomerData)

Domyślnie Hyva zarządza ładowaniem sekcji prywatnych (Private Content/CustomerData) w pliku `private-content.phtml`, zapisując je w `localStorage` pod kluczem `mage-cache-storage` i emitując zdarzenie `private-content-loaded`.

Mixin [customer-data-mixin.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/web/js/mixin/customer-data-mixin.js) integruje to zachowanie dwukierunkowo z Knockout.js:

1. **Z Hyva do KO**:
   Nasłuchuje zdarzenia `private-content-loaded` i aktualizuje wartości w observables KO (`customerData.set`). Używa przy tym flagi blokującej `isSyncing` oraz porównania JSON, aby uniknąć nieskończonej pętli zdarzeń.
2. **Z KO do Hyva**:
   Przechwytuje operacje `customerData.set` wywołane przez wtyczki KO i emituje zdarzenie `private-content-loaded` z nową strukturą danych, aby Alpine.js i minikoszyk Hyva natychmiast zaktualizowały swój widok.
3. **Obsługa Inwalidacji**:
   Gdy płatność lub akcja KO wywoła `customerData.invalidate(['cart'])`, mixin przechwytuje to wywołanie i wysyła zdarzenie `reload-customer-section-data` do Hyva. Hyva pobiera świeże dane z serwera, po czym most automatycznie propaguje je z powrotem do KO.

---

## 7. REST API Interceptor (Przechwytywanie AJAX)

Plik [storage-mixin.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/web/js/mixin/storage-mixin.js) podmienia zachowanie systemowego modułu `mage/storage`. 

Gdy wtyczka KO wywołuje zapytanie REST AJAX (np. POST `/totals-information` lub POST `/shipping-information`), interceptor:
- Blokuje fizyczne wysłanie żądania sieciowego HTTP.
- Wyciąga aktywną instancję komponentu Magewire (`$wire`) bezpośrednio z DOM.
- Wywołuje metodę backendową `$wire.call('refreshCheckoutState')`.
- Mapuje otrzymany z Magewire zaktualizowany stan Quote na obiekt JSON w formacie wymaganym przez specyfikację API REST Magento.
- Zwraca obiekt `jQuery.Deferred().resolve(...)` o identycznej sygnaturze co `$.ajax`, co sprawia, że wtyczka KO odbiera dane lokalnie bez opóźnień sieciowych.

---

## 8. Dwu-kierunkowy Reaktywny Adapter Stanu (Alpine <-> Knockout)

Synchronizacja stanu pól formularzy (adresy dostawy, płatności, dane kontaktowe) odbywa się automatycznie w tle — **bez per-keystroke Magewire** dla adresu:

- **DOM → Magewire (zapis adresu)**:
  Po `blur`/`change` (dirty) Alpine zbiera snapshot DOM (`collectAddressFieldsFromDom`) i wywołuje atomowo `syncAddressFields`. Place order najpierw robi `flushAddressSync()`. Nie ma zapisu Magewire na każdym naciśnięciu klawisza; debounce 800 ms dotyczy wyłącznie walidacji UI e-mail.
- **Magewire → KO** (po udanym sync / selectach):
  W Alpine (`script.phtml`) `$watch` na polach z `window.fastcheckoutAddressFields` (+ `paymentMethod`) woła `window.fastcheckoutHyvaPayment.syncFieldToKo`, które aktualizuje observables quote KO (`street[0–3]`, atrybuty opcjonalne, billing*).
- **Z KO do Magewire/Alpine**:
  W [checkout-bridge.js](file:///var/www/html/app/code/Kkkonrad/Fastcheckout/view/frontend/web/js/hyva/checkout-bridge.js) most subskrybuje observables `quote.shippingAddress`, `quote.billingAddress` oraz `quote.paymentMethod`. Jeśli bramka płatności KO zmodyfikuje te obiekty (np. Braintree zaktualizuje adres rozliczeniowy), subskrypcja automatycznie synchronizuje te zmiany z powrotem do pól komponentu Magewire za pomocą `$wire.set()` (z flagą `fastcheckoutSuppressKoAddressToMagewire` podczas DOM flush).

---

## 9. Izolacja Wizualna Shadow DOM z Pełną Kompatybilnością

Aby zapobiec zakłóceniom wizualnym (konflikty klas Tailwind CSS z Hyva ze stylami osadzonych bramek KO) przy zachowaniu poprawnego wyglądu, zaimplementowano hybrydową architekturę **Shadow DOM**:

- **Struktura**: Główny kontener KO `#fastcheckout-ko-payment-root` pozostaje w tradycyjnym drzewie DOM (light DOM) jako ukryty bazowy pool bindowania KO. Po zaznaczeniu konkretnej metody płatności, skrypt dynamicznie tworzy Shadow Root na dedykowanym placeholderze wybranej metody (`[data-fastcheckout-payment-method-ko-target]`). Formularz płatności (`.payment-method`) przed wstrzyknięciem do Shadow DOM jest opakowywany w element `div` z klasą `.fastcheckout-payment-method-ko-container`.
- **Klonowanie Stylów**: Przy inicjalizacji każdego Shadow Root skrypt automatycznie klonuje do jego wnętrza **wszystkie** dostępne na stronie arkusze stylów `<link rel="stylesheet">` (w tym główny plik Tailwind CSS). Dzięki temu formularz płatności zachowuje 100% spójności wizualnej z motywem Hyva i dedykowanym arkuszem stylów `hyva-ko-payment.css`.
- **Kompatybilność z Bramkami i Filtracja Frameworków (DOM Overrides)**:
  Aby umożliwić bramkom płatności odnajdywanie ich kontenerów wewnątrz Shadow DOM, nadpisano metody wyszukiwania `document.getElementById`, `document.querySelector` oraz `document.querySelectorAll`:
  - **Bezpieczeństwo Alpine/Magewire**: Przeciążenia automatycznie filtrują zapytania. Jeśli selektor zawiera odwołania typowe dla Livewire, Magewire lub Alpine.js (np. `wire:`, `x-`), wyszukiwanie odbywa się **wyłącznie w tradycyjnym DOM (light DOM)**. Zapobiega to zakłóceniom w procesach DOM diffingu i reaktywności motywu Hyva.
  - **Przeszukiwanie Shadow DOM**: Dla pozostałych zapytań system KO i bramki płatności płynnie odpytują aktywne shadow rooty w poszukiwaniu pól kart.
