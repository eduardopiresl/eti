#include <SPI.h>
#include <MFRC522.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#define PINO_DHT    2
#define PINO_PIR    3
#define PINO_LED    4
#define PINO_AGUA   5
#define PINO_RST    9
#define PINO_SS    10
#define PINO_LDR   A0

#define LIMIAR_CLARO        700
#define MAX_PESSOAS          10
#define INTERVALO_STATUS   2000UL
#define JANELA_ENTRADA    15000UL
#define ANTIREPIQUE_CARTAO 3000UL
#define DURACAO_MOV        3000UL
#define CARENCIA_SAIDA    10000UL

MFRC522 rfid(PINO_SS, PINO_RST);
DHT dht(PINO_DHT, DHT22);
OneWire umFio(PINO_AGUA);
DallasTemperature sensorAgua(&umFio);

unsigned long presentes[MAX_PESSOAS];
byte totalPessoas = 0;

unsigned long cartaoPendente = 0;
unsigned long inicioPendente = 0;

unsigned long tempoInatividade = 30000UL;
unsigned long ultimoMovimento = 0;
unsigned long ultimaSaida = 0;
bool pirAnterior = false;
bool avisouInatividade = false;
bool lampada = false;

unsigned long ultimoStatus = 0;
unsigned long ultimoCartao = 0;
unsigned long tempoUltimoCartao = 0;

char comando[20];
byte tamComando = 0;

void imprimirNumero(float valor) {
  if (isnan(valor)) Serial.print(F("null"));
  else Serial.print(valor, 1);
}

void enviarEvento(const __FlashStringHelper* acao, unsigned long uid) {
  Serial.print(F("{\"tipo\":\"evento\",\"acao\":\""));
  Serial.print(acao);
  Serial.print(F("\""));
  if (uid != 0) {
    Serial.print(F(",\"cartao\":\""));
    Serial.print(uid, HEX);
    Serial.print(F("\""));
  }
  Serial.print(F(",\"pessoas\":"));
  Serial.print(totalPessoas);
  Serial.println(F("}"));
}

void enviarStatus() {
  float temperatura = dht.readTemperature();
  float umidade     = dht.readHumidity();

  float agua = sensorAgua.getTempCByIndex(0);
  if (agua == DEVICE_DISCONNECTED_C) agua = NAN;
  sensorAgua.requestTemperatures();

  int luz = analogRead(PINO_LDR);
  bool movimento = digitalRead(PINO_PIR) == HIGH ||
                   (ultimoMovimento != 0 && millis() - ultimoMovimento < DURACAO_MOV);

  Serial.print(F("{\"tipo\":\"status\",\"temp\":"));
  imprimirNumero(temperatura);
  Serial.print(F(",\"umid\":"));
  imprimirNumero(umidade);
  Serial.print(F(",\"agua\":"));
  imprimirNumero(agua);
  Serial.print(F(",\"luz\":"));
  Serial.print(luz);
  Serial.print(F(",\"claro\":"));
  Serial.print(luz > LIMIAR_CLARO ? 1 : 0);
  Serial.print(F(",\"lampada\":"));
  Serial.print(lampada ? 1 : 0);
  Serial.print(F(",\"mov\":"));
  Serial.print(movimento ? 1 : 0);
  Serial.print(F(",\"pessoas\":"));
  Serial.print(totalPessoas);
  Serial.print(F(",\"porta\":"));
  Serial.print(cartaoPendente != 0 ? 1 : 0);
  Serial.print(F(",\"inatividade\":"));
  Serial.print(tempoInatividade / 1000);
  Serial.println(F("}"));
}

bool estaEscuro() {
  return analogRead(PINO_LDR) <= LIMIAR_CLARO;
}

void mudarLampada(bool ligar, const __FlashStringHelper* motivo) {
  if (ligar == lampada) return;
  lampada = ligar;
  digitalWrite(PINO_LED, ligar ? HIGH : LOW);

  Serial.print(F("{\"tipo\":\"evento\",\"acao\":\"lampada\",\"estado\":"));
  Serial.print(ligar ? 1 : 0);
  Serial.print(F(",\"motivo\":\""));
  Serial.print(motivo);
  Serial.print(F("\",\"pessoas\":"));
  Serial.print(totalPessoas);
  Serial.println(F("}"));
}

unsigned long lerUID() {
  unsigned long uid = 0;
  for (byte i = 0; i < 4 && i < rfid.uid.size; i++) {
    uid = (uid << 8) | rfid.uid.uidByte[i];
  }
  return uid;
}

int procurar(unsigned long uid) {
  for (int i = 0; i < totalPessoas; i++) {
    if (presentes[i] == uid) return i;
  }
  return -1;
}

void registrarCartao(unsigned long uid) {
  int pos = procurar(uid);

  if (pos >= 0) {
    presentes[pos] = presentes[totalPessoas - 1];
    totalPessoas--;
    enviarEvento(F("saida"), uid);
    if (totalPessoas == 0) {
      ultimaSaida = millis();
      avisouInatividade = false;
      mudarLampada(false, F("sala_vazia"));
    }
  } else if (totalPessoas >= MAX_PESSOAS) {
    enviarEvento(F("lotada"), uid);
  } else {
    cartaoPendente = uid;
    inicioPendente = millis();
    enviarEvento(F("porta_liberada"), uid);
  }
}

void aoDetectarMovimento(bool virtualMov) {

  if (cartaoPendente == 0 && totalPessoas == 0 &&
      ultimaSaida != 0 && millis() - ultimaSaida < CARENCIA_SAIDA) {
    return;
  }

  ultimoMovimento = millis();
  avisouInatividade = false;
  if (virtualMov) enviarEvento(F("movimento_virtual"), 0);

  if (cartaoPendente != 0) {
    presentes[totalPessoas] = cartaoPendente;
    totalPessoas++;
    enviarEvento(F("entrada"), cartaoPendente);
    cartaoPendente = 0;
    if (estaEscuro()) mudarLampada(true, F("entrada"));
  } else if (totalPessoas == 0) {
    enviarEvento(F("intruso"), 0);
  } else if (!lampada && estaEscuro()) {
    mudarLampada(true, F("movimento"));
  }
}

void verificarTempos() {

  if (cartaoPendente != 0 && millis() - inicioPendente > JANELA_ENTRADA) {
    enviarEvento(F("entrada_cancelada"), cartaoPendente);
    cartaoPendente = 0;
  }

  if (totalPessoas > 0 && !avisouInatividade &&
      millis() - ultimoMovimento > tempoInatividade) {
    avisouInatividade = true;
    enviarEvento(F("inatividade"), 0);
    mudarLampada(false, F("inatividade"));
  }
}

void executarComando(char* cmd) {
  if (strcmp(cmd, "MOV") == 0) {
    aoDetectarMovimento(true);
  } else if (strcmp(cmd, "LUZ 1") == 0) {
    mudarLampada(true, F("manual"));
  } else if (strcmp(cmd, "LUZ 0") == 0) {
    mudarLampada(false, F("manual"));
  } else if (strncmp(cmd, "TEMPO ", 6) == 0) {
    long segundos = atol(cmd + 6);
    if (segundos >= 5) {
      tempoInatividade = (unsigned long)segundos * 1000UL;
      avisouInatividade = false;
    }
    enviarStatus();
  } else if (strcmp(cmd, "ZERAR") == 0) {
    totalPessoas = 0;
    cartaoPendente = 0;
    avisouInatividade = false;
    mudarLampada(false, F("zerar"));
    enviarEvento(F("zerado"), 0);
  } else if (strcmp(cmd, "STATUS") == 0) {
    enviarStatus();
  } else {
    Serial.println(F("{\"tipo\":\"erro\",\"msg\":\"comando desconhecido\"}"));
  }
}

void lerComandos() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      comando[tamComando] = '\0';
      if (tamComando > 0) executarComando(comando);
      tamComando = 0;
    } else if (tamComando < sizeof(comando) - 1) {
      comando[tamComando++] = toupper(c);
    }
  }
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  dht.begin();

  sensorAgua.begin();
  sensorAgua.setWaitForConversion(false);
  sensorAgua.requestTemperatures();

  pinMode(PINO_PIR, INPUT);
  pinMode(PINO_LED, OUTPUT);
  digitalWrite(PINO_LED, LOW);

  Serial.println(F("{\"tipo\":\"inicio\"}"));
}

void loop() {

  lerComandos();

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    unsigned long uid = lerUID();
    if (uid != ultimoCartao || millis() - tempoUltimoCartao > ANTIREPIQUE_CARTAO) {
      registrarCartao(uid);
    }
    ultimoCartao = uid;
    tempoUltimoCartao = millis();
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  bool pir = digitalRead(PINO_PIR) == HIGH;
  if (pir && !pirAnterior) aoDetectarMovimento(false);
  pirAnterior = pir;

  verificarTempos();

  if (millis() - ultimoStatus >= INTERVALO_STATUS) {
    ultimoStatus = millis();
    enviarStatus();
  }
}
