# AutentiCar – Chatbot de Vistoria Veicular com IA

Protótipo do projeto **AutentiCar – Plataforma de Vistoria Veicular Digital** (UNINOVE, Projeto de Extensão em Desenvolvimento de Sistemas, 2026).

O cliente informa a placa e envia fotos do veículo pelo celular. O chatbot analisa cada foto, procura sinais de fraude e gera um laudo: **aprovada automaticamente**, **análise humana** ou **pendente**.

## O que o chatbot faz

| Função (seção do projeto) | Como é feito neste protótipo |
|---|---|
| Qualidade da captura (4.1) | Nitidez (variância do Laplaciano) e brilho, calculados no navegador |
| Leitura de placa e chassi (4.2) | IA de visão (Claude) lê a placa e o chassi e compara com a placa informada |
| Identificação de avarias (4.3) | IA de visão marca possíveis amassados, arranhões e vidros trincados |
| Foto repetida (4.4) | SHA-256 do arquivo e hash perceptual (dHash) comparado com as fotos da sessão |
| Metadados (4.4) | Verifica ausência de EXIF, assinatura de editores (Photoshop, Snapseed etc.) e idade do arquivo |
| Imagem editada / foto de tela / veículo diferente (4.4) | IA de visão aponta indícios |
| Fluxo de decisão (4.5) | Sem alerta: aprovação automática. Com alerta: o caso vai para o painel do analista |
| Revisão humana (4.5 e 7.7) | Página `/analista` com senha: lista os casos, mostra fotos e alertas e registra aprovar ou reprovar; o chatbot mostra a decisão ao cliente |
| Transparência (4.7) | O laudo lembra o direito de contestação (LGPD, art. 20) |

Também há cartões com **fotos de modelo** (ilustrações) mostrando o enquadramento de cada foto.

## Como rodar

Requisitos: Node.js 18 ou superior e uma chave da API da Anthropic.

```bash
git clone <url-do-seu-repositorio>
cd autenticar-chatbot
npm install
cp .env.example .env      # edite o .env: cole sua chave e defina ANALYST_PASSWORD
npm start
```

Abra http://localhost:3000. O painel do analista fica em http://localhost:3000/analista (senha definida em `ANALYST_PASSWORD`). No celular, use o IP da máquina na mesma rede (a câmera do navegador pode exigir HTTPS fora do localhost).

## Estrutura

```
autenticar-chatbot/
├── public/index.html   # front-end (chat, análises locais, laudo)
├── public/analista.html # painel do analista (revisão humana)
├── server.js           # backend que protege a chave e chama a API
├── package.json
├── .env.example
└── README.md
```

## Revisão humana (painel do analista)

1. Quando o laudo tem alerta, o chatbot envia o caso (fotos reduzidas, alertas e observações) ao servidor e mostra um protocolo ao cliente.
2. O analista abre `/analista`, entra com a senha, revisa o caso e escolhe **Aprovar** ou **Reprovar**, com uma observação.
3. O chatbot consulta o servidor a cada 5 segundos e mostra a decisão na conversa.

Para a demonstração, rode o servidor no seu computador e abra o chatbot e o painel em duas abas.

## Limitações (importante para a apresentação)

- **Protótipo web, não o SDK do app.** GPS, Play Integrity API e App Attest (seção 4.4) dependem do app nativo e não existem aqui.
- A verificação de "foto tirada na hora" é limitada: o navegador só informa a data do arquivo.
- A IA usada é um modelo de linguagem com visão, não os modelos YOLO/PyTorch treinados descritos no projeto. Os resultados são indicativos e a decisão final cabe ao analista humano.
- As fotos de modelo são ilustrações vetoriais.
- O estado da vistoria fica na memória do navegador, e os casos em revisão ficam na memória do servidor (somem ao reiniciá-lo). Não há banco de dados nem DW (seções 5 a 8 do projeto).
- O painel do analista usa uma senha única e não envia notificação de novos casos: a lista atualiza sozinha a cada 5 segundos.

## Segurança e LGPD

- A chave da API fica só no servidor (`.env`, que está no `.gitignore`). Nunca a coloque no front-end.
- O servidor limita as análises de IA a 30 por minuto por IP. Em produção, acrescente autenticação.
- Fotos de veículos e placas são dados pessoais. Antes de usar com dados reais, defina finalidade, prazo de guarda e base legal.

## Equipe

Bruno Teixeira Pires, Jaqueline E. N. De Lima, Jeferson Sanches Gama, Lais da Silva Candido, Larissa Jarola de Morais Abe, Luiz Fernando dos Santos Rosa, Samuel Santos Correia e Wallan Olímpio Cruz.
