# FNaF 2 ESP32 audio bridge

Esta é a imagem mínima de bancada para o ESP32-WROOM-32. A placa funciona como
receptor Bluetooth Classic A2DP com o nome `FNAF2 Audio Consumer`, decodifica o
SBC recebido e encaminha o PCM estéreo para o APK pela rede Wi‑Fi
`FNAF2-AUDIO` (senha `fnaf2-audio`). O APK registra seu endereço atual no ESP32
pela porta UDP `49711`; os fatos de saúde seguem por unicast na porta `49709` e
o PCM na porta `49710`. Assim, a renovação DHCP não depende de o telefone
receber sempre o endereço `192.168.4.2`; a UART permanece disponível para
diagnóstico e flash.

O ESP32 não contém assets, nomes semânticos ou matched filters. O APK é a
autoridade de análise: recebe o PCM, calcula RMS/onset/matched-filter, mantém o
phase clock, classifica os IDs e combina áudio com contexto visual. O
`main.c` antigo permanece no repositório como fallback de transição, mas a
imagem atual é compilada a partir de `main/bridge.c`.

O firmware distribui o Bluetooth/Bluedroid no core 0 e o encaminhamento PCM,
Wi-Fi e telemetria no core 1. Como ambos os transportes compartilham o mesmo
rádio de 2,4 GHz, a coexistência usa a política balanceada. A telemetria de
transporte informa separadamente conexão/stream A2DP, estações Wi-Fi, registro
do destino UDP, callbacks PCM, fila, heap e margem de stack; a mensagem de boot
inclui o motivo do reset.

O perfil `g56-esp32-a2dp-v0-uncalibrated` e a faixa de latência `0..1000 ms`
continuam provisórios até a calibração no aparelho real.

## Transporte PCM de bancada

Cada datagrama UDP da porta `49710` contém um cabeçalho little-endian de 28
bytes seguido por PCM estéreo assinado de 16 bits, também little-endian:

`magic:u32 version:u8 channels:u8 format:u8 reserved:u8 sample_rate:u32 seq:u32 t_capture_us:u64 payload_bytes:u16 reserved2:u16`

`magic` é `0x46325043`, `version` é `1` e `format` é `1`. O `seq` permite
contar perdas UDP; o `t_capture_us` é o timestamp monotônico aproximado do
primeiro frame do pacote. O host deve associar o MAC/IP do ESP32 ao ensaio e
recusar datagramas de outra origem.

O sample rate vem da configuração SBC negociada. O octeto 0 usa
`0x80=16000`, `0x40=32000`, `0x20=44100` e `0x10=48000` Hz, conforme o exemplo
A2DP sink do ESP-IDF. Não inverter essa tabela: rotular 44,1 kHz como 32 kHz
torna tanto o monitor quanto o WAV aproximadamente 37,8% mais lentos.

O callback A2DP atualiza somente contadores sob o spinlock e o libera antes de
copiar PCM para a fila FreeRTOS. Nenhuma operação de fila ou rede ocorre dentro
de seção crítica. A fila retém no máximo 16 blocos (cerca de 100 ms), e perdas
são explicitadas em `queueDropped` em vez de acumular áudio antigo.

## Build e flash

Requer ESP-IDF 5.4.x, com o alvo `esp32`:

```sh
cd firmware/esp32-audio-consumer
. /home/pedro/esp/esp-idf/export.sh
idf.py set-target esp32
idf.py build
idf.py -p /dev/ttyACM0 flash
idf.py -p /dev/ttyACM0 monitor
```

O monitor deve mostrar JSON lines como:

```json
{"schema":"fact-message-v1","seq":0,"type":"audio-route","state":"UNKNOWN","confidence":0.000000,"source":"esp32-audio-consumer","calibrationProfile":"g56-esp32-a2dp-v0-uncalibrated","t_received":1000,"latencyMin":0,"latencyMax":1000,"reason":"a2dp-disconnected"}
```

O telefone deve parear/conectar ao dispositivo A2DP e também entrar na rede
`FNAF2-AUDIO`. Só depois que a conexão estiver ativa aparecerão `audio-rms` e
`audio-peak` com valores observados. O APK recebe o mesmo PCM e pode gravá-lo
sem ADB, USB ou computador.

O `bridge.c` não aceita comandos de pilotagem. Ele só publica saúde e PCM; toda
decisão e qualquer controle permanecem no APK.
