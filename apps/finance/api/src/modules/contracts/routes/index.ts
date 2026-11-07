// Rotas do módulo de clientes e contratos, cada uma montada no server.ts com a
// permissão do seu cadastro (requireCatalogAccess).
export { default as clientRoutes } from './clients';
export { default as serviceCatalogRoutes } from './serviceCatalog';
export { default as contractRoutes } from './contracts';
