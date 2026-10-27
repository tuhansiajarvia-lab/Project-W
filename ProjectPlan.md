Projektisuunnitelma: Suomalaisten ruokakauppojen paikallinen alennusaggregaattori

1. Projektin nimi
Finnish Grocery Price Aggregator (tai TarjousHub Local)

2. Projektin tavoite
Luoda täysin autonominen, paikallinen järjestelmä, joka kerää, tunnistaa (OCR) ja jäsentelee automaattisesti eri suomalaisten ruokakauppaketjujen ajankohtaisia alennuksia ja kuvastoja ilman kalliita pilvipalvelu-API-rajapintoja, tarjoamalla yhtenäisen verkkokäyttöliittymän tuotteiden hakuun ja älykkääseen suodatukseen.

3. Kuvaus
Projekti ratkaisee monen eri vähittäiskaupan viikoittaisten tarjousten seurannan yhdessä paikassa. Järjestelmä automatisoi digitaalisten kuvastojen skannauksen, muuntaa ne kuviksi, tunnistaa tekstin paikallisella neuroverkolla (EasyOCR), suorittaa tilallisen (spatial) jäsennyksen hintojen, nimien ja alennusten tarkkaan yhdistämiseen, tallentaa tiedot yhtenäiseen tietokantaan (SQLite) ja tarjoaa käyttäjälle monikielisen käyttöliittymän (FI / EN / RU).

4. Käytetyt teknologiat
Skrapaus ja automaatio: Node.js, Playwright.

OCR-mikropalvelu: Python, Flask, EasyOCR, PyTorch, Pillow.

Tietokanta: SQLite (better-sqlite3).

Taustaohjelma (API): Node.js, Express, CORS.

Käyttöliittymä: HTML5, CSS3, Vanilla JavaScript.

Suoritusympäristö: Paikallinen tietokone / kotipalvelin (PowerShell, Node.js, Python venv).

5. Päätoiminnot
Monimuotoinen latausohjelma: Modulaarinen arkkitehtuuri eri kauppaketjujen verkkosivujen parsintaan.

Autonominen OCR-putki: Tekstien ja koordinaattien (Bounding Boxes) tunnistus offline-tilassa EasyOCR:n avulla.

Älykäs tilallinen jäsennys: Hintojen, nimien ja alennustyyppien yhdistäminen Euklidisen etäisyyden perusteella, roskan suodatus.

Joustava tarjousten luokittelu: Prosenttialennuksien (discount_percent) ja paketti- / moniostoehtojen (offer_type) erottelu.

REST API suodatuksella: Haku avainsanoilla, suodatus kauppojen/kategorioiden mukaan, lajittelu hinnan ja edullisuuden mukaan.

Mukautuva verkkokäyttöliittymä: Modernit tuotekortit, kielten vaihto ja nopea vasteaika.

6. Projektin aikataulu (3 kuukautta)
Kuukausi 1: Perusta, prosessiputki ja ensimmäinen lähde (Lidl)

Viikko 1: Tietokannan arkkitehtuurin suunnittelu, Node.js- ja Python-ympäristön määritys.

Viikko 2: Playwright-pohjaisen skraaperin kehitys kuvastojen lataamiseen (dloader.js).

Viikko 3: Paikallisen Python Flask + EasyOCR -mikropalvelun käynnistys ja integrointi (enricher.js).

Viikko 4: Tilallisen jäsennysosan toteutus, datan puhdistus, discount_percent- ja offer_type-kenttien erottelu, ensimmäinen vakaa vienti SQLiteen.

Kuukausi 2: Jälleenmyyjien laajennus ja Backend API

Viikko 5: REST API:n kehitys Node.js / Express -alustalla (server.js) datan hakua, hakukyselyitä ja lajittelua varten.

Viikko 6: Skraaperin arkkitehtuurin laajentaminen toisen suuren suomalaisen ketjun (esim. S-Market tai K-Citymarket) lisäämiseksi.

Viikko 7: Parserin mukautus uuden kaupan ulkoasun ja hintamallien mukaiseksi.

Viikko 8: Eri ketjujen datan yhdistäminen yhteiseen tietokantaan, nimien ja hintamuotojen ristiriitojen testaus.

Kuukausi 3: Käyttöliittymä, viimeistely ja julkaisu

Viikko 9: Käyttöliittymän kehitys (front/app.js): frontendin kytkeminen backend API:hin, dynaamisten tuotekorttien renderöinti.

Viikko 10: Kauppa- ja kategorialuokkien suodattimien sekä hinta-/alennuslajittelun toteutus UI:hin. Kielenvaihdon lisäys (FI/EN/RU).

Viikko 11: Järjestelmän kattava testaus (prosessiputken integraatiotestit, OCR:n reunatapaukset, tietokantakyselyjen optimointi).

Viikko 12: Koodin lopullinen refaktorointi, käyttöohjeen kirjoittaminen (README), valmiin aggregaattorin käynnistys päivittäiseen käyttöön.

7. Testaus
Yksikkötestaus: Hintojen normalisointifunktioiden, nimien validoinnin ja geometristen laskelmien oikeellisuuden tarkistus.

Integraatiotestaus: Koko syklin ajo kuvastojen skannauksesta SQLite-tallennukseen useiden ketjujen osalta.

UI/API-testaus: Backendin vasteajan, suodattimien toiminnan ja käyttöliittymän responsiivisuuden tarkistus selaimessa.

8. Yhteenveto
Täysin itsenäinen, paikallinen alennusaggregaattori suomalaisille kaupoille modulaarisella rakenteella, jonka ansiosta uusia kauppaketjuja on helppo lisätä tarpeen mukaan ilman riippuvuutta maksullisista pilvipalveluista.

9. Kehitysnäkymät (Versio 2.0)
Lähteiden ja kuvastojen laajentaminen

Digitaalisten kuvastojen automaattinen keräys ja parsinta muille suomalaisille ketjuille (S-Market, K-Citymarket, Prisma, Tokmanni, HalpaHalli jne.).

Yhtenäinen tuoteluokittelu luokittain eri kauppojen hintojen helppoa vertailua varten.

Oma tili ja tunnistautuminen

Käyttäjärekisteröinti: Tilikorttien luonti edistyneiden sosiaalisten toimintojen avaamiseksi.

Pelillistäminen ja motivaatiojärjestelmä: Pisteiden, luokitusten ja tasojen (esim. ”Tarjousmetsästäjä”, ”Säästöexpert”) kerryttäminen aktiivisuudesta ja alennusten vahvistamisesta.

Alennusten joukkoistaminen (UGC — User Generated Content)

Kuvien jakaminen myymälätarjouksista: Mahdollisuus rekisteröityneille käyttäjille ladata valokuvia hintalapuista suoraan myymälöistä (paikalliset alennukset ja poistotuotteet, jotka eivät sisälly virallisiin kuvastoihin).

Automaattinen kuvien OCR-tunnistus: Käyttäjien lataamien kuvien käsittely OCR-palvelun kautta hintojen ja tuotteiden automaattiseksi poimimiseksi.