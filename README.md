# Dojo Hamdar — Campeonatos

Site estático integrado ao Firebase Authentication e ao Cloud Firestore. Os dados são organizados nas coleções `events`, `athletes`, `matches`, `brackets` e `schedules`.

## Configurar o Firebase

O projeto usa a configuração web fornecida em [`firebase-config.js`](./firebase-config.js). Ela identifica o aplicativo Firebase e não substitui as regras de segurança.

1. No Firebase Console, crie ou habilite um banco em **Firestore Database**.
2. Em **Authentication > Sign-in method**, habilite **E-mail/senha** e crie a conta de administração. O site não oferece cadastro público.
3. Publique as regras de [`firestore.rules`](./firestore.rules) em **Firestore Database > Rules**.
4. Em **Authentication > Users**, copie o UID da conta criada. No Firestore Console, crie a coleção `admins` e um documento cujo ID seja exatamente esse UID. O conteúdo pode ser, por exemplo, `{ "role": "admin" }`. A coleção `admins` não pode ser lida ou alterada pelo site.
5. Hospede o site em um domínio autorizado em **Authentication > Settings > Authorized domains**. Para desenvolvimento local, use um servidor HTTP em `localhost`, não abra o HTML diretamente como arquivo.
6. Abra a área **Administração** e entre com a conta criada.

As regras permitem leitura pública das coleções usadas pelo site, mas somente UIDs presentes em `admins` podem criar, alterar ou excluir dados. Como inscrições e resultados aparecem nas páginas públicas, os documentos de atletas (incluindo nome, equipe, categoria e peso) também ficam legíveis publicamente. Publique apenas dados cujo compartilhamento tenha sido autorizado.

## Dados locais existentes

Se este navegador já usava a versão anterior, entre na administração enquanto o Firestore estiver vazio e escolha **Importar dados locais para o Firestore**. A importação é manual e não inclui o evento de teste `evt-teste` nem seus atletas fictícios. Exporte um backup JSON antes de migrar.

## Executar localmente

Sirva os arquivos com qualquer servidor HTTP estático, por exemplo:

```sh
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`. Os scripts do Firebase são carregados pela CDN oficial; não é necessário um processo de build.
