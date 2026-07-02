# The Resistance — Online

En webbversion av brädspelet **The Resistance** (grundspelet, 5–10 spelare) som ni
kan spela ihop i realtid över internet — skapa en lobby, dela länken, och spela
direkt i webbläsaren, även på mobilen.

Bygget är en enda Node.js-process: Express serverar frontend-filerna och
Socket.io hanterar all realtidskommunikation. Allt spelstate hålls i serverns
minne per lobby (ingen databas).

## Innehåll

- [Testa lokalt](#testa-lokalt)
- [Deploya till Render (gratis, publik länk)](#deploya-till-render-gratis-publik-länk)
- [Begränsningar med gratis-tier](#begränsningar-med-gratis-tier)
- [Projektstruktur](#projektstruktur)
- [Antaganden som gjorts](#antaganden-som-gjorts)
- [Vidareutveckling](#vidareutveckling)

## Testa lokalt

Kräver [Node.js](https://nodejs.org) 18 eller senare.

```bash
npm install
npm start
```

Öppna sedan `http://localhost:3000` i webbläsaren. Öppna gärna flera flikar
(eller be en kompis på samma nätverk öppna din lokala IP) för att testa med
flera spelare samtidigt.

### Automatiska tester

Två testskript finns för att verifiera spellogiken utan att behöva sitta med
flera webbläsarflikar:

```bash
node scripts/test-rules.js       # Regelmotorn: uppdrag, röstning, vinstvillkor
node scripts/simulate-game.js    # Fullständiga spel med 5/7/10 bottar + reconnect
```

Vill du manuellt klicka runt i UI:t men slippa öppna 5–10 flikar kan du starta
servern (`npm start`), skapa en lobby i webbläsaren, och sedan i en annan
terminal köra:

```bash
node scripts/fill-lobby.js DIN-LOBBYKOD
```

Det fyller lobbyn med fyra robotspelare som auto-godkänner/spelar Framgång, så
du kan se hela spelflödet i din egen webbläsare.

## Deploya till Render (gratis, publik länk)

Render är valt eftersom det kan köra en enda Node-process med WebSockets utan
extra konfiguration, och har en gratis nivå. Så här kopplar du ditt GitHub-repo
till Render steg för steg:

1. **Lägg upp koden på GitHub** (om det inte redan är gjort):
   - Skapa ett nytt repo på [github.com/new](https://github.com/new).
   - I mappen med projektet, kör:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/DITT-ANVÄNDARNAMN/DITT-REPO.git
     git push -u origin main
     ```

2. **Skapa ett konto på [render.com](https://render.com)** och logga in (går
   bra att logga in direkt med ditt GitHub-konto).

3. Klicka **New +** → **Blueprint** (Render läser då `render.yaml` som redan
   finns i projektet och ställer in allt automatiskt). Om du inte ser
   Blueprint-alternativet, välj istället **New +** → **Web Service**.

4. Välj ditt GitHub-repo. Render frågar om den får access till repot första
   gången — godkänn det.

5. Om du använde **Web Service** (inte Blueprint) istället, fyll i manuellt:
   - **Name**: valfritt, t.ex. `the-resistance-online`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

6. Klicka **Create Web Service** (eller **Apply** om du använde Blueprint).
   Render bygger och startar servern automatiskt — det tar ett par minuter
   första gången.

7. När det är klart får du en publik URL, typ
   `https://the-resistance-online.onrender.com`. Den är din permanenta
   speladress — dela den (eller lobbylänkar som skapas utifrån den, se nedan)
   med dina vänner.

Varje gång du pushar nya ändringar till `main`-branchen på GitHub bygger och
deployar Render om appen automatiskt.

## Begränsningar med gratis-tier

- **Servern somnar vid inaktivitet.** Render Free stänger ner tjänsten efter
  ~15 minuter utan trafik. Nästa besökare får vänta 30–60 sekunder medan
  servern startar om ("cold start"). Efter det är allt snabbt igen.
- **Spelstate finns bara i minnet.** Om servern somnar eller startas om
  (t.ex. vid en ny deploy) försvinner alla pågående lobbyer och spel. Se till
  att inte deploya om medan ni har ett spel igång.
- **En instans.** Free-planen kör bara en serverinstans, vilket är precis vad
  vi vill här eftersom spelstate hålls i minnet (flera instanser skulle inte
  dela state).

Om ni spelar ofta och cold starts känns jobbigt finns Renders betalda
"Starter"-nivå som håller tjänsten varm, men det krävs inte för att spelet
ska fungera.

## Projektstruktur

```
server/
  index.js       Express + Socket.io-server, all socketkommunikation
  game.js        Regelmotorn (Game-klassen) — all spellogik, testbar isolerat
  rooms.js       Håller reda på alla aktiva lobbyer/rum i minnet
  constants.js   Regeltabeller (antal spioner, teamstorlekar per spelarantal)
public/
  index.html
  css/style.css  Allt utseende — färgpalett, typsnitt, bordslayout, animationer
  js/app.js      Klientlogik: routing mellan skärmar, rendering, interaktion
  js/net.js      Socket.io-anslutning + session/reconnect via localStorage
  js/svg.js      Alla handritade SVG-illustrationer (kortbaksidor, roller, ikoner)
scripts/
  test-rules.js       Regelmotor-tester (ingen server behövs)
  simulate-game.js    Fullständig spelsimulering över socket.io
  fill-lobby.js       Manuellt testverktyg — fyller en riktig lobby med bottar
render.yaml      Render-konfiguration
```

## Antaganden som gjorts

Kravspecen var ovanligt detaljerad, men några punkter krävde ett rimligt
antagande:

- **Röstningar är öppna precis som i det fysiska spelet** — alla ser hur alla
  röstade efter att omröstningen är avslöjad (det är så originalspelet
  fungerar; bara *uppdragskorten* är hemliga även efter avslöjande, då visas
  bara antalet sabotage, inte vem som lade dem).
- **Ledarens teamval är privat tills det bekräftas.** Andra spelare ser inte
  vilka ledaren "provklickar på" innan hen skickar in det slutgiltiga
  förslaget — bara det bekräftade laget visas för alla. Det matchar hur
  klicket känns (fysiskt, inte ett formulär) utan att kräva att varje
  mellanklick synkas över nätverket.
- **Är värden borta ur lobbyn** (innan spelet startat) flyttas värdrollen
  automatiskt till nästa anslutna spelare, så lobbyn aldrig fastnar utan
  någon som kan starta spelet.
- **Värden kan ta bort en frånkopplad spelare ur lobbyn** före start (inte
  ett krav i specen, men användbart om någon aldrig kommer tillbaka och ni
  behöver fylla platsen med någon annan).
- **Rumskoder** är 5 tecken (utan lätt förväxlade tecken som 0/O eller 1/I).

## Vidareutveckling

Kodstrukturen är medvetet uppdelad så att den ska vara enkel att bygga
vidare på:

- **Nya roller (t.ex. Avalon-stil Merlin/Assassin)**: `server/game.js` har
  redan en `roles`-Map (`playerId -> rollnamn`) och `privateRoleInfo()`
  skickar bara det respektive spelare får se. Lägg till nya rollnamn i
  `constants.js`, utöka rolltilldelningen i `startGame()`, och lägg till
  motsvarande UI-logik (nya SVG-kort i `svg.js`, ny overlay-text i `app.js`).
- **Fler samtidiga lobbyer** hanteras redan (varje lobby är en egen
  `Game`-instans i minnet), så inga ändringar behövs där för att skala upp
  antalet samtidiga bord.
- Om spelstate behöver överleva omstarter i framtiden är `Game`s state redan
  en enkel, serialiserbar structure (`toPublicState()` + de privata `roles`
  och `sessionToken`-fälten) — att lägga till Redis eller en databas som
  persistenslager kräver bara att byta ut `RoomManager` i `server/rooms.js`.
