# subir containers
docker compose up postgres redis emqx -d

# rodar backend
cd backend && npm run start:dev

# gerar migration
cd backend && npm run migration:generate -- src/migrations/NomeDaMigration

# rodar migrations
cd backend && npm run migration:run
