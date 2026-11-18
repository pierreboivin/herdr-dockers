# herdr-dockers

Mod [Herdr](https://herdr.dev) qui affiche les conteneurs Docker dans la barre d'état. Une icône indique le nombre de conteneurs actifs. Elle passe à la couleur d'alerte si un conteneur est `unhealthy`. Un clic ouvre une popup qui liste les conteneurs, regroupés par projet Docker Compose. Le projet du dossier courant apparaît en premier.

Dans la popup :

- **logs** ouvre un onglet avec `docker logs -f`.
- **shell** ouvre un onglet avec `docker exec -it` (bash si disponible, sinon sh).
- **redémarrer** / **démarrer** lance `docker restart` ou `docker start`.
- Un clic sur un port ouvre `http://localhost:<port>`.
- « Afficher arrêtés » montre aussi les conteneurs arrêtés.

Le mod lance `docker ps -a` aux 5 secondes, et aux 3 secondes quand la popup est ouverte.

## Installation

```sh
git clone git@github.com:pierreboivin/herdr-dockers.git ~/www/herdr-dockers
ln -sfn ~/www/herdr-dockers/mods/docker ~/.config/herdr-app/mods/docker
herdr-app check ~/.config/herdr-app/mods/docker
```

Les layouts livrés avec Herdr sont remplacés à chaque démarrage. Pour placer l'icône, il faut donc cloner `main` :

```sh
herdr-app do layout.clone '{"name":"main","as":"main-docker"}'
```

Dans `~/.config/herdr-app/layouts/main-docker.json`, remplacer le bloc `"id": "status"` par :

```json
{ "id": "status-row", "type": "row", "size": { "px": 28 }, "resizable": false, "children": [
  { "id": "status", "type": "block", "size": { "weight": 1 }, "content": { "mod": "workspace-status" } },
  { "id": "docker-status", "type": "block", "size": { "px": 72 }, "content": { "mod": "docker" } }
] }
```

## Après une mise à jour de Herdr

Le mod reste en place. Le layout cloné ne reçoit pas les changements que Herdr apporte au layout `main`. Si `main` change, il faut le cloner de nouveau et refaire le remplacement ci-dessus. `ctrl-shift-l` permet de revenir au layout `main` en tout temps.
