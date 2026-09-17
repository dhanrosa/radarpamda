# Auditoria do projeto de prospecção B2B

## Estado após a implementação do uso real

O conteúdo abaixo deste bloco é **histórico**, referente à versão inicial.
O fluxo foi posteriormente substituído por busca real no Google Places:

- Removidos resultados iniciais, presets, dados sujos de demonstração, geração de
  lojas, telefones e coordenadas, além da dependência de Gemini no fluxo de busca.
- A interface consulta o backend real, deduplica por Place ID e carrega outras páginas.
- Entradas e saídas são validadas; falhas retornam erro JSON e nunca criam contatos.
- O mapa CARTO/HTML de popup foi retirado. A localização real é aberta no Google Maps,
  por links construídos pelo aplicativo, sem outra chave.
- Telefones inválidos não geram WhatsApp; coordenadas ausentes permanecem null.
- Exportação CSV neutraliza fórmulas; JSON não usa coordenadas zero para ausências.
- Backend e source maps ficam fora da pasta pública; modo de produção é explícito.
- Dependências Vite/esbuild alinhadas e instalação npm com lockfile; limite de buscas,
  validação de origem e escuta local por padrão.

Validação: 22 testes de dados/API e 6 testes de navegador passaram; build e TypeScript
passaram. No navegador, uma busca real retornou 20 estabelecimentos e a próxima
página trouxe outros 20, totalizando 40, sem erros JavaScript. Os dados sintéticos
restantes estão restritos aos testes e não são importados pelo site.

**Limites atuais:** uso local; sem autenticação, persistência ou mapa incorporado.
Uma implantação pública exige controle de acesso e quotas compartilhadas. O texto
histórico a seguir não deve ser lido como descrição do código atual.

---

Data: 17/09/2026. Ambiente: Windows, Node 24.14.0, npm 11.9.0.

**Conclusão: o fluxo original não está pronto para prospecção real nem para exposição pública.**
Ele apresenta dados inventados como estabelecimentos processados, permite derrubar o
servidor com uma entrada inválida e insere dados não confiáveis como HTML no mapa.
A nova função Google Places adicionada durante esta revisão consulta uma fonte real,
mas a tela existente continua conectada ao endpoint antigo.

Foram revisados o backend, todos os componentes, utilitários, tipos, configuração,
manifesto e lockfile. As referências abaixo correspondem ao projeto após a adição
da nova função Places. Não foi feito teste de invasão contra sistemas de terceiros.

## Achados prioritários do fluxo original

### 1. Alta — uma requisição inválida encerra o servidor

Local: `server.ts`, handler de `/api/process-leads`, especialmente o `catch` que chama
`gerarFallbackLeads` novamente com a entrada original.

Reprodução local, sem chave Gemini:

```json
{"termos":["teste"],"regiao_alvo":{}}
```

`regiao.match()` lança erro. O `catch` repete a mesma operação e sua Promise rejeita
fora de tratamento. Na combinação instalada de Express 4 e Node 24, **o processo
encerrou com código 1**, confirmado por HTTP. A rota não exige autenticação.

Correção: validar tipos antes de qualquer processamento, devolver 400 para entrada
inválida, eliminar o fallback com a mesma entrada defeituosa e tratar todas as
rejeições de handlers assíncronos. [Tratamento de erros no Express](https://expressjs.com/en/guide/error-handling/).

### 2. Alta — HTML não confiável no popup do mapa

Local: `src/components/LeadMap.tsx:96`, interpolação de nome, endereço, telefone e link.

`popupContent.innerHTML` interpreta como HTML os valores recebidos. Um endereço com
`<img src=x onerror="document.body.dataset.audit=1">` atravessa o fallback intacto,
inclusive pela API HTTP. Dados de scraper ou instruções maliciosas preservadas pelo
modelo também podem alcançar esse ponto.

O caminho entrada → resposta → HTML foi confirmado; **a execução do evento em um
navegador não foi testada nesta auditoria**. A análise não pressupõe persistência
dos dados nem exploração contra outro usuário sem que ele carregue esses dados.

Correção: criar elementos DOM e atribuir texto com `textContent`; validar URLs
separadamente. O escape padrão do React não protege um `innerHTML` montado fora dele.
[Riscos de innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML).

### 3. Alta funcional — lojas e contatos são fabricados silenciosamente

Locais: `server.ts:134`, `server.ts:224`, tratamento de erro ao final do endpoint;
`src/App.tsx:12`.

- `gerarFallbackLeads` inventa seis lojas, ruas, números de telefone e coordenadas.
- A falta da chave ou uma falha no Gemini produz HTTP 200 com esses dados.
- Um prompt solicitando dentistas em São Paulo retornou lojas de celulares no Batel,
  Curitiba, porque o fallback ignora o texto livre.
- Dados brutos fornecidos para limpeza foram descartados e substituídos por exemplos.
- A carga inicial da interface contém contatos fixados no código sem indicação de demonstração.

O prompt interno também pede estabelecimentos e coordenadas “realistas”, alterando
o requisito original de estruturar parâmetros para uma busca posterior. Não havia
chamada Places, scraper ou ferramenta de consulta habilitada no fluxo original.

Correção: no estágio de interpretação, retornar parâmetros e
`resultados_processados: []`; preencher resultados somente com fonte identificada.
Erros de provedor devem permanecer erros. Exemplos devem ficar em um modo explícito
de demonstração e não gerar contatos aparentemente reais.

### 4. Alta — endpoint de IA sem controle de acesso ou consumo

Local: `server.ts`, `/api/process-leads` e `express.json({ limit: '10mb' })`.

Qualquer cliente que alcance o servidor pode iniciar chamadas ao Gemini. Não há
autenticação, limite por usuário/IP, limite de concorrência ou orçamento da aplicação.
O servidor escuta em `0.0.0.0`. A exposição externa efetiva depende do firewall e do deploy.

Impacto: consumo indevido de quota e dinheiro, além de indisponibilidade. Não foi
realizado teste de carga nem consumo deliberado da quota Gemini.

Correção: autenticação, limites compartilhados entre instâncias, tamanho de entrada
compatível com a operação e controle de tempo/consumo. A nova rota Places tem limites
locais, mas também exige controle de acesso antes de uma publicação pública.

### 5. Alta — links de WhatsApp aceitam destinos arbitrários

Local: `server.ts:277`; consumidores em `LeadMap.tsx` e `LeadsList.tsx`.

O teste `includes('wa.me')` aceita `https://wa.me.audit.invalid/...` e
`javascript:/*wa.me*/void(0)`. Ambos foram preservados no teste da sanitização quando
não há celular que substitua o link. A validação não verifica protocolo, hostname,
caminho ou correspondência com o telefone.

Correção: construir links somente de dígitos validados, ou usar `URL` e exigir
`https:`, hostname exatamente `wa.me` e caminho telefônico válido. Não confiar em
substring, no modelo ou no fato de um elemento React receber o endereço.

### 6. Média — exportação CSV permite fórmulas

Local: `src/lib/geoUtils.ts:98`.

A função escapa aspas, mas não neutraliza conteúdo interpretável como fórmula.
Um endereço `=1+1` foi exportado como `"=1+1"`. Dependendo do aplicativo de planilha,
isso é avaliado como fórmula; aspas CSV apenas delimitam o campo. Não houve execução
em Excel/LibreOffice nesta auditoria.

Correção: exportar células como texto de maneira compatível com o aplicativo alvo,
incluindo tratamento de prefixos de fórmula e caracteres de controle.
[CSV Injection — OWASP](https://community.owasp.org/attacks/CSV_Injection).

### 7. Média — backend e source map publicados como arquivos estáticos

Locais: `package.json:8` e `server.ts:323`.

O build grava `server.cjs` e `server.cjs.map` no mesmo diretório `dist` servido por
`express.static`. Com `NODE_ENV=production`, os dois foram baixados com HTTP 200.
O source map inclui fontes. Isso revela a implementação; **não foi constatada chave
embutida nesses arquivos**.

Correção: separar o diretório público do artefato de servidor e manter source maps
de backend fora da raiz estática.

### 8. Alta funcional — JSON válido não significa contrato válido

Locais: `server.ts:239` até `res.json(parsed)`, `src/App.tsx:109` e
`src/components/StrictJsonViewer.tsx:55`.

O backend usa MIME JSON, mas não declara schema nem valida integralmente a resposta.
Foram reproduzidos: `{}` aceito como resultado, `termos` string no fallback, endereço
objeto, telefone numérico que provoca substituição por dados fictícios, coordenadas
fora dos limites e número `1e999` que termina como `null` na serialização.

Os tipos TypeScript não validam dados em runtime. O frontend verifica apenas parte
da estrutura e depois chama métodos como `.toLowerCase()` e `.toFixed()`.
O selo “100% Conforme Regras” usa regex sem âncoras e validação parcial de links;
não valida existência de lojas, coordenadas, DDD ou o contrato completo.

Correção: schema de entrada e saída em runtime, limites de tamanho, de 1 a 3 termos
não vazios, tipos corretos, coordenadas finitas e intervalos geográficos. Configurar
também saída estruturada no modelo, mantendo validação posterior.
[Saída estruturada do Gemini](https://ai.google.dev/gemini-api/docs/structured-output).

### 9. Média — classificação e normalização telefônica incorretas

Locais: `server.ts:49` e `src/lib/geoUtils.ts:29`.

`rest.length === 9 || (...)` aceita qualquer número local com nove dígitos, mesmo
que não comece com 9. Exemplos reproduzidos:

| Entrada | Resultado incorreto |
| --- | --- |
| `41123456789` | celular `+55 (41) 12345-6789` |
| `20912345678` | DDD inválido aceito como celular |
| `+1 415 555 2671` | convertido para `+55 (14) 15555-2671` |
| `sem telefone` | permanece no campo como se fosse telefone |

Não há validação de DDD, país estrangeiro, ramais ou múltiplos números concatenados.
Há implementações duplicadas no servidor e no frontend. A normalização de nomes
também pode transformar marcas como `iPhone` em `Iphone` e diverge nas siglas aceitas.

Correção: parser compartilhado com regras claras para país, DDD, fixo, celular e
número inválido. Celulares brasileiros seguem `9XXXX-XXXX`; fixos não devem ganhar
um nono dígito inventado. [Anatel](https://www.gov.br/anatel/pt-br/regulado/numeracao/nono-digito).

Criar `wa.me` é construir um link; não comprova uma conta WhatsApp ativa. O produto
deve diferenciar “link gerado” de “WhatsApp verificado”.

### 10. Média — coordenadas estimadas são apresentadas como localização de lojas

Local: `server.ts:111` e tratamento de coordenadas na resposta.

O código aplica deslocamentos artificiais sobre centros de cidades/bairros.
Manaus sem correspondência caiu em Curitiba. “Pinheiros, São Paulo” correspondeu
primeiro à entrada genérica “São Paulo”, por ordem de substring. Coordenadas ausentes
foram inventadas; `lat: 999, lng: 999` foram aceitos.

Correção: usar coordenadas do provedor/geocodificação confiável. Dados ausentes
devem permanecer ausentes conforme contrato definido; não substituí-los por Curitiba
ou por `(0,0)`. Uma máscara de campos não obriga a fonte a possuir esses dados.

### 11. Média — instalação padrão falha e execução depende do ambiente

Locais: `package.json`, `bun.lock`, `README.md`, `server.ts`.

- `npm install` falhou com `ERESOLVE`: Vite 8.3.0 exige peer opcional esbuild
  `^0.27.0 || ^0.28.0`, mas o projeto declara `^0.25.0`.
- Para diagnóstico, as dependências foram instaladas com `--legacy-peer-deps`, sem
  scripts de instalação e sem gerar/alterar lockfile. Isso é um contorno de auditoria.
- A cópia inicial tinha apenas `bun.lock`, apesar de o README indicar npm. Ao fechar
  a auditoria, também havia um `package-lock.json` na pasta, preservado sem alterações
  por esta revisão. É preciso definir o gerenciador/lockfile oficial; o manifesto
  continua declarando as versões incompatíveis descritas acima.
- `npm start` não define `NODE_ENV=production`; se o ambiente não o definir, o backend
  inicia Vite em modo desenvolvimento. A porta está fixada em 3000.
- O script `clean` usa `rm -rf`, inadequado ao shell padrão deste Windows.

Correção: alinhar versões e gerenciador/lockfile, documentar Node e execução de
produção, respeitar a porta do ambiente e usar limpeza compatível com Windows.

O README orientava `.env.local`, enquanto o servidor lia somente `.env`.
**Esse item foi corrigido ao adicionar Places:** agora carrega `.env.local` e `.env`,
com prioridade para a primeira e preservação das variáveis já definidas no processo.
[Comportamento do dotenv](https://github.com/motdotla/dotenv#path).

### 12. Menor — inconsistências na interface e ciclo de vida do mapa

Constatadas por inspeção; não reproduzidas em navegador:

- `LeadMap.tsx` não remove a instância Leaflet ao desmontar; cada seleção recria
  marcadores e executa `fitBounds`, podendo interromper popups e a posição escolhida.
- A seleção compara `nome_loja`, confundindo filiais homônimas; não há deduplicação
  confiável dos resultados.
- Ao receber zero resultados, `App.tsx` mantém o lead anteriormente selecionado.
- `LeadsList.tsx` confirma cópia sem aguardar/tratar falha do clipboard.
- `LeadStats.tsx` exibe “100% formatados” como texto fixo.
- Busca e seleção não têm persistência; campos de status existem nos tipos, mas não
  constituem um fluxo de CRM implementado.

## Nova função solicitada: Google Places

Implementada em `server/googlePlaces.ts`, com wrapper para React em
`src/lib/googlePlaces.ts` e endpoint `POST /api/places/search`.

- URL: `https://places.googleapis.com/v1/places:searchText`.
- Consulta padrão: `assistência técnica de celular centro, Curitiba`.
- Máscara exata: `places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location`.
- Retorno: array com os campos nativos do Google, sem inventar telefone ou localização.
- A credencial é lida no servidor por `GOOGLE_MAPS_API_KEY`; a variável existente no
  `.env` foi renomeada preservando seu valor, sem copiá-lo para este relatório.
- Timeout, validação, erros explícitos, até duas consultas simultâneas e dez consultas
  por minuto por processo. Esses limites não substituem autenticação nem orçamento
  global em implantações com várias instâncias.
- A função não dispara ao importar e retorna a primeira página. Não há paginação
  automática, confirmação de WhatsApp ou integração automática com a tela antiga.

Uma consulta real executada retornou **20 resultados; 20 com nome, endereço,
telefone e coordenadas**. Não houve necessidade de aproximar ou completar dados.
O conteúdo dos contatos e a credencial não foram gravados nos artefatos de auditoria.

Variáveis `VITE_` podem ser expostas no frontend; por isso a implementação conserva
a chave no backend. [Documentação do Vite](https://vite.dev/guide/env-and-mode).
A máscara seleciona os campos solicitados e influencia o nível de cobrança; solicitar
telefone não significa que o campo exista em todos os estabelecimentos.
[Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search).

## Verificações realizadas e limites

| Verificação | Resultado |
| --- | --- |
| Instalação padrão npm | Falhou por conflito Vite/esbuild |
| Instalação somente para diagnóstico | Concluída com `--legacy-peer-deps` |
| `npm run lint` | Passou; o script executa TypeScript, não um linter de segurança |
| `npm run build` | Passou após o contorno da instalação |
| `node --test tests/googlePlaces.test.mjs` | 11 testes da nova integração passaram |
| `node audit/reproduce.mjs` | 23 verificações, incluindo um controle válido; reproduz defeitos com SDK/HTTP simulados |
| `node audit/integration.mjs` | HTTP real local: fallback fictício, entrada HTML preservada, arquivos backend públicos, erro JSON respondido em HTML e encerramento do processo; nova rota retorna 400/503 corretamente |
| `node audit/check-places.mjs` | Uma consulta real, 20 estabelecimentos retornados |
| Busca da credencial no JavaScript compilado do frontend | Chave não encontrada |
| Base pública de advisories npm | 177 nomes de pacotes instalados consultados; nenhum advisory retornado |

A consulta de dependências não equivale a prova de ausência de vulnerabilidades,
não cobre código próprio e corresponde à árvore instalada pelo npm para diagnóstico,
não a uma instalação congelada do Bun. Resultado em `audit/dependency-advisories.json`.
O identificador `gemini-3.8-flash` foi confirmado na
[documentação oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash);
não foi classificado como modelo inexistente.

Não foram realizadas chamadas reais ao Gemini, teste de carga, teste de XSS em
navegador, abertura de CSV em planilha ou análise jurídica. Os processos criados para
os testes HTTP foram encerrados. O código legado permanece com os achados acima.

## Ordem recomendada para correção

1. Impedir encerramento do servidor por entrada inválida e retirar dados fictícios
   do fluxo normal.
2. Eliminar HTML não confiável, validar links e separar arquivos públicos dos arquivos
   de backend.
3. Aplicar autenticação, quotas e validação integral de entrada/saída.
4. Conectar a busca real ao fluxo da interface, definir representação de dados ausentes,
   normalizar telefones e usar apenas coordenadas verificáveis.
5. Corrigir instalação, execução de produção, CSV e ciclo de vida do mapa.

O prompt original também precisa explicitar: resultado inicial vazio antes da busca,
proibição de inventar dados, tratamento de fixos, campos ausentes, duplicatas e região
ambígua. Instruções ao modelo ajudam a definir comportamento; não substituem validação
nem os controles do backend.
