# BOT CRUPTO — frontend 2.1

Fundação web local com React, TypeScript, Vite e Three.js. Apenas piso, cubo,
esfera, cilindro, câmera fixa, iluminação e indicador fictício. Não implementa
escritório completo, personagens, animações, controles operacionais ou integração.

## Executar

Requer Node 24.15+ da linha 24 e npm. Validado com Node 24.18.0 / npm 11.16.0.

```powershell
cd D:\04-Projetos\30-bot-crypto-agence\front
npm ci --cache .npm-cache --no-fund
npm run dev
```

Abra http://127.0.0.1:5173. Nenhum backend é necessário. A fixture fixa
publica passo 0, instante 2026-01-01T00:00:00.000Z e estado fictício pausado.
Não há cotações, ordens ou cálculo financeiro. A interface não faz requisições
para APIs; carrega somente os arquivos locais da própria aplicação.

## Validar

```powershell
npm test
npm test -- tests/unit/scene.test.ts
npm run typecheck
npm run build
npm run test:browser
```

Os testes de navegador requerem Google Chrome instalado. Playwright usa esse
navegador local, sem baixar Chromium. O teste sobe o preview do build na porta
4173, verifica WebGL2 real, pixels de cada objeto, resize desktop/mobile,
ausência de erros de console e requisições externas, indisponibilidade de WebGL
e perda real de contexto. Encerra o preview automaticamente. Rode build antes.

Para inspeção manual: `npm run preview`, abra o endereço mostrado, confirme
os três objetos e piso, redimensione a janela e confira o console do navegador.

## Organização e decisões

- `src/main.tsx` e `src/bootstrap.tsx`: entrada e montagem/desmontagem React.
- `src/scene/mountScene.ts`: cena, renderização, resize, erro e limpeza WebGL.
- `src/contracts` e `src/fixtures`: contrato visual e dados determinísticos.
- `src/components`: apresentação e estados de carregamento/pronto/falha.
- `tests/unit`: ciclo de vida com renderer simulado, contratos e interface.
- `tests/browser`: validação independente em Chrome real, sobre build de produção.
- `evidence`: registros RED/GREEN, capturas, metadados WebGL e preservação backend.

A decisão arquitetural DEC-063 / ARCH-001 aprova React/Vite/Three.js para esta
fase. Three.js direto evita uma abstração React adicional para quatro meshes
estáticos. O módulo isolado permite evoluir a representação futura sem colocar
lógica financeira na renderização; nenhuma fase posterior foi implementada.

Versões diretas exatas e dependências transitivas travadas no package-lock.json.
Licenças das dependências diretas verificadas no npm: MIT, exceto TypeScript e
Playwright (Apache-2.0). Sem estado global, física, animação, cloud ou serviços pagos.

O tamanho inicial de câmera acompanha o aspecto do contêiner; ResizeObserver e
resize da janela atualizam viewport/projeção/densidade (limitada a 2). A cena
estática renderiza sob demanda, sem loop contínuo. Desmontagem, erro e perda
de contexto cancelam frame, desconectam observer, removem listeners/canvas,
liberam geometrias, materiais e renderer e encerram o contexto. O descarte é
idempotente. Falhas exibem orientação para verificar WebGL e recarregar a página.

Referências técnicas consultadas: [Vite / requisitos Node](https://vite.dev/guide/)
e [Three.js / liberação de recursos](https://threejs.org/manual/pages/cleanup.html).

## Evidências e limitações

Registro RED antes de qualquer módulo de produção: três suítes falharam por
imports ausentes (`evidence/tests-red.txt`). GREEN: 20 testes em três suítes.
Os mocks unitários não comprovam WebGL. Essa comprovação está nos três testes
Chrome e capturas reais, com WebGL2 e pixels registrados em `evidence/webgl.json`.
Uma sobreposição mobile descoberta na inspeção visual foi reproduzida em teste
(`evidence/mobile-red.txt`) e corrigida antes da validação final.

Build e typecheck PASS. O Vite informa um aviso de chunk Three.js acima de
500 kB (aproximadamente 132 kB gzip). Ele já é carregado por import dinâmico;
otimização adicional fica fora desta fundação. Não há medição percentual de
cobertura: os oito requisitos de testes da tarefa foram cobertos por cenários.

Preflight: pasta vazia, sem arquivos ou AGENTS.md aplicável, sem Git em `front`
ou ancestrais. Nenhum repositório foi criado. O backend foi consultado apenas
para decisões/documentação e verificação de preservação. Seu HEAD inicial:
`9d6956a8b2de9579bc85a5a2f76ce457f0f5942a`; sete alterações locais preexistentes
registradas sem alteração. Hashes de 137 arquivos (incluindo não rastreados)
conferidos ao final, excluindo `.git`, `node_modules`, `dist` e `coverage`.
Nenhum staging, commit ou push.
