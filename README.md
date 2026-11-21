# Sala Inteligente

Protótipo de sala inteligente com **Arduino Nano**, **Firebase Realtime Database** e o
dashboard do **ETI (Escola Tecnológica Inteligente)**.

O Arduino mede temperatura e umidade (DHT22), luz (LDR), movimento (HC-SR501),
temperatura da água do filtro (DS18B20) e controla quem entra e sai pelo cartão (RC522).
Um LED faz o papel da lâmpada da sala.

```
Arduino ──USB──> computador da sala (Chrome, "Conectar Arduino") ──> Firebase ──> site (qualquer lugar)
        <──USB── comandos (MOV, LUZ 1, TEMPO 30…)                <── Firebase <── botões do site
```

## Pastas

| Pasta | O que tem |
|---|---|
| `arduino/sala_inteligente/` | Código do Arduino (abrir no Arduino IDE) |
| `site/` | Site estático (dashboard, avisos, registro, painel de TV) |
| `servidor-local.js` | Servidor para testar o site no computador |

## Montagem

| Peça | Ligação |
|---|---|
| DHT22 | VCC 5V · DATA D2 · GND · 10k entre VCC e DATA |
| HC-SR501 (PIR) | VCC 5V · OUT D3 · GND |
| LED (lâmpada) | D4 → 680 Ω → perna longa · perna curta no GND |
| DS18B20 (água) | vermelho 5V · amarelo D5 · preto GND · ~5k (2×10k em paralelo) entre 5V e amarelo |
| LDR | 5V → LDR → A0 → 10k → GND |
| RC522 (RFID) | SDA D10 · SCK D13 · MOSI D11 · MISO D12 · RST D9 · 3,3V · GND |

Bibliotecas: DHT sensor library + Adafruit Unified Sensor, MFRC522, OneWire, DallasTemperature.

## Regras da sala (no Arduino)

1. Cartão novo → porta liberada por 15 s; com movimento no PIR → **entrada** (+1).
2. Cartão de quem já está dentro → **saída** (−1).
3. Movimento com a sala vazia e sem cartão → alerta de **intruso**.
4. Gente na sala e nenhum movimento pelo tempo configurado → **inatividade** e a lâmpada apaga.
5. Lâmpada acende quando alguém entra no escuro e apaga quando a última pessoa sai.

## Testar o site no computador

```bash
node servidor-local.js
```

Abra http://localhost:5500 no **Chrome ou Edge**, entre e clique em **Conectar Arduino**
(feche antes o Monitor Serial do Arduino IDE: a porta USB só pode ser usada por um programa).

## Publicar

No Vercel ou no GitHub Pages, publique a pasta `site/` (no Vercel: *Root Directory* = `site`).
O "Conectar Arduino" funciona no site publicado porque ele usa https.

As regras do banco estão em **modo teste até 21/12/2026**. Depois disso o Firebase
recusa leitura e gravação até as regras serem atualizadas.
