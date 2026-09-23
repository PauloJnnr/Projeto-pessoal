# PIW Client

Cliente desktop do Poke Idle World, distribuido por GitHub Releases.

## Primeiro release

1. Crie um repositorio no GitHub e envie este projeto.
2. Confirme que o workflow `.github/workflows/release.yml` foi enviado.
3. Crie a primeira tag de versao:

```powershell
git add .
git commit -m "Preparar atualizacao automatica"
git branch -M main
git remote add origin https://github.com/PauloJnnr/PIW-Cliente.git
git push -u origin main
git tag v1.0.0
git push origin v1.0.0
```

Ao receber a tag `v1.0.0`, o GitHub Actions compila o instalador e cria uma GitHub Release automaticamente.

## Publicar uma atualizacao

1. Altere a versao em `package.json`, por exemplo de `1.0.0` para `1.0.1`.
2. Envie as alteracoes e crie uma tag com a mesma versao:

```powershell
git add .
git commit -m "Atualizar cliente"
git push origin main
git tag v1.0.1
git push origin v1.0.1
```

O cliente instalado verifica novas Releases ao iniciar, baixa a atualizacao em segundo plano e solicita o reinicio para instalar.

## Observacoes

- O workflow usa `GITHUB_TOKEN`; nao e necessario criar token manual.
- O instalador gerado manualmente por `npm run dist` usa valores neutros de configuracao. Para publicar, use tags no GitHub Actions.
- O atualizador funciona em uma versao instalada e empacotada, nao durante `npm start`.
- Para reduzir alertas do Windows, publique futuramente um certificado de assinatura de codigo.
