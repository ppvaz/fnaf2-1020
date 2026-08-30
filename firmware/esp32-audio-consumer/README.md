# FNaF 2 ESP32 audio consumer

Primeira imagem de bancada para o ESP32-WROOM-32. Ela transforma a placa num
receptor Bluetooth Classic A2DP com o nome `FNAF2 Audio Consumer`. Ele também
cria a rede Wi‑Fi `FNAF2-AUDIO` (senha `fnaf2-audio`) e transmite os mesmos
fatos por UDP broadcast para a porta `49709`; a UART continua disponível para
diagnóstico e flash. O callback do sink recebe o PCM decodificado pelo stack,
calcula RMS/peak por janelas de um segundo e escreve fatos `fact-message-v1`.

Esta versão é intencionalmente shadow-only: não detecta `cue-*`, não interpreta
um áudio como evento de jogo e não controla o telefone. O perfil
`g56-esp32-a2dp-v0-uncalibrated` e a faixa de latência `0..1000 ms` são
provisórios; precisam ser substituídos por uma calibração do receptor antes de
qualquer promoção.

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

O telefone deve parear/conectar ao dispositivo A2DP. Só depois que a conexão
estiver ativa aparecerão `audio-rms` e `audio-peak` com valores observados.

Para o transporte Wi‑Fi de bancada, conecte o telefone à rede `FNAF2-AUDIO`.
O `cue-helper` precisa estar numa sessão de captura ativa para abrir seu
listener UDP e aceitar somente os três tipos de health facts desta imagem.
Esse caminho é shadow-only e não aceita `cue-*` nem comandos.
