# Pesquisa de UX de voz

## Referências consultadas

A documentação oficial do Claude descreve dois modos úteis para o Klipza: um modo sem as mãos, que escuta pausas naturais, e um modo push-to-talk, que dá ao usuário controle explícito em ambientes ruidosos. A mesma referência posiciona a voz como uma experiência que preenche o prompt enquanto a pessoa fala, com um controle claro para parar a captura. Fonte: https://support.claude.com/en/articles/11101966-use-voice-mode.

A documentação do MDN sobre Web Speech API diferencia resultados intermediários (`interimResults`) de resultados finais e mostra que `isFinal` deve ser usado para separar o texto provisório do texto confirmado. Também documenta `continuous`, `lang`, `maxAlternatives`, `start()`, `stop()`, `speechend` e `error` como pontos importantes do ciclo de reconhecimento. Fonte: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API.

## Decisões para o Klipza

A animação será um estado de escuta calmo, com halo pulsante, ondas discretas e uma mensagem curta, sem copiar a interface do Claude. A transcrição será acumulada apenas uma vez por resultado final, enquanto o trecho intermediário será exibido separadamente; reinícios automáticos serão protegidos contra duplicação e contra múltiplos listeners. O idioma será derivado das configurações do usuário e poderá usar o idioma do navegador como fallback.
